import type { Pool } from "pg";
import type { DespachoRecord, DespachoRepository } from "../../domain/repositories.js";
import { AppError } from "../../domain/errors.js";
import { audit } from "./store.js";
import { transaction } from "./pool.js";

type DespachoRow = {
  id: string;
  pedido_id: string;
  mixer_id: string;
  conductor_id: string;
  volumen_m3: number;
  hora_salida: Date | null;
  hora_llegada: Date | null;
  llegada_por_usuario_id: string | null;
  estado: DespachoRecord["estado"];
  iniciado_por_usuario_id: string | null;
  iniciado_en: Date | null;
};

type ConductorRow = { id: string; nombre_completo: string; disponible: boolean };

const despachoFrom = (row: DespachoRow): DespachoRecord => ({
  id: row.id,
  pedidoId: row.pedido_id,
  mixerId: row.mixer_id,
  conductorId: row.conductor_id,
  volumenM3: Number(row.volumen_m3),
  horaSalida: row.hora_salida?.toISOString() ?? null,
  horaLlegada: row.hora_llegada?.toISOString() ?? null,
  llegadaPorUsuarioId: row.llegada_por_usuario_id,
  estado: row.estado,
  iniciadoPorUsuarioId: row.iniciado_por_usuario_id,
  iniciadoEn: row.iniciado_en?.toISOString() ?? null,
});

export class PgDespachoStore implements DespachoRepository {
  constructor(private readonly pool: Pool) {}

  async obtenerPedidoAprobado(pedidoId: string) {
    const result = await this.pool.query<{ volumen_m3: string }>(
      `SELECT volumen_total_m3 AS volumen_m3
       FROM cotizaciones
       WHERE id = $1 AND estado = 'APROBADA' AND valida_hasta > now()`,
      [pedidoId]
    );
    return result.rows[0] ? { volumenM3: Number(result.rows[0].volumen_m3) } : null;
  }

  async obtenerConductoresDisponibles() {
    const result = await this.pool.query<ConductorRow>(
      `SELECT c.id, c.nombre_completo,
         NOT EXISTS (
           SELECT 1 FROM despachos d
           WHERE d.conductor_id = c.id AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
         ) AS disponible
       FROM conductores c
       WHERE c.activo
       ORDER BY c.nombre_completo`
    );
    return result.rows.map((row) => ({ id: row.id, nombre: row.nombre_completo, disponible: row.disponible }));
  }

  async crearDespacho(despacho: Omit<DespachoRecord, "horaSalida" | "estado">): Promise<DespachoRecord> {
    const available = await this.pool.query(
      `SELECT 1
       FROM camiones_mixer m
       WHERE m.codigo = $1 AND m.estado = 'DISPONIBLE'
         AND m.capacidad_m3 >= $2
         AND NOT EXISTS (
           SELECT 1 FROM despachos d
           WHERE d.mixer_id = m.codigo AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
         )
       LIMIT 1`,
      [despacho.mixerId, despacho.volumenM3]
    );
    if (!available.rowCount) {
      throw new AppError(409, "MIXER_NO_DISPONIBLE", "El mixer no está disponible, no tiene capacidad suficiente o ya tiene un viaje activo");
    }
    const driver = await this.pool.query(
      `SELECT 1 FROM conductores c
       WHERE c.id = $1 AND c.activo
         AND NOT EXISTS (
           SELECT 1 FROM despachos d
           WHERE d.conductor_id = c.id AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
         )`,
      [despacho.conductorId]
    );
    if (!driver.rowCount) throw new AppError(409, "CONDUCTOR_NO_DISPONIBLE", "El conductor no está disponible o ya tiene un viaje activo");
    const result = await this.pool.query<DespachoRow>(
      `INSERT INTO despachos(id, pedido_id, mixer_id, conductor_id, volumen_m3)
       VALUES($1, $2, $3, $4, $5)
       RETURNING *`,
      [despacho.id, despacho.pedidoId, despacho.mixerId, despacho.conductorId, despacho.volumenM3]
    );
    if (!result.rows[0]) throw new AppError(404, "DESPACHO_NO_ENCONTRADO", "Despacho no encontrado");
    return despachoFrom(result.rows[0]!);
  }

  async iniciarTransito(despachoId: string, horaSalida: string): Promise<DespachoRecord> {
    const result = await this.pool.query<DespachoRow>(
      `UPDATE despachos
       SET hora_salida = $2, estado = 'EN_TRANSITO', actualizado_en = now()
       WHERE id = $1
       RETURNING *`,
      [despachoId, horaSalida]
    );
    if (!result.rows[0]) throw new AppError(404, "DESPACHO_NO_ENCONTRADO", "Despacho no encontrado");
    return despachoFrom(result.rows[0]!);
  }

  async obtenerDespachoDelConductor(usuarioId: string) {
    const result = await this.pool.query<DespachoRow>(
      `SELECT d.*
       FROM despachos d
       JOIN conductores c ON c.id = d.conductor_id
       WHERE c.usuario_id = $1 AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
       ORDER BY d.creado_en ASC
       LIMIT 1`,
      [usuarioId],
    );
    return result.rows[0] ? despachoFrom(result.rows[0]) : null;
  }

  async iniciarTransitoComoConductor(despachoId: string, usuarioId: string, horaSalida: string) {
    return transaction(this.pool, async (client) => {
      const result = await client.query<DespachoRow>(
        `UPDATE despachos d
         SET hora_salida = $3, iniciado_en = $3, iniciado_por_usuario_id = $2,
             estado = 'EN_TRANSITO', actualizado_en = $3
         FROM conductores c
         WHERE d.id = $1 AND c.id = d.conductor_id AND c.usuario_id = $2
           AND d.estado = 'PENDIENTE'
         RETURNING d.*`,
        [despachoId, usuarioId, horaSalida],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          `SELECT 1 FROM despachos d
           JOIN conductores c ON c.id = d.conductor_id
           WHERE d.id = $1 AND c.usuario_id = $2`,
          [despachoId, usuarioId],
        );
        if (!exists.rowCount) throw new AppError(403, "DESPACHO_NO_ASIGNADO", "El despacho no está asignado a su cuenta");
        throw new AppError(409, "DESPACHO_YA_INICIADO", "El despacho ya fue iniciado o no está pendiente");
      }

      await audit(client, { id: usuarioId, email: "", nombre: "Conductor autenticado", rol: "CONDUCTOR" }, "DESPACHO_INICIADO_POR_CONDUCTOR", despachoId, {
        usuarioId,
        horaServidor: horaSalida,
        metodo: "confirmacion_conductor",
      });
      return despachoFrom(result.rows[0]);
    });
  }

  async registrarLlegadaComoConductor(despachoId: string, usuarioId: string, horaLlegada: string) {
    return transaction(this.pool, async (client) => {
      const result = await client.query<DespachoRow>(
        `UPDATE despachos d
         SET hora_llegada = $3, llegada_por_usuario_id = $2,
             estado = 'EN_OBRA', actualizado_en = $3
         FROM conductores c
         WHERE d.id = $1 AND c.id = d.conductor_id AND c.usuario_id = $2
           AND d.estado = 'EN_TRANSITO'
         RETURNING d.*`,
        [despachoId, usuarioId, horaLlegada],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          `SELECT d.estado FROM despachos d
           JOIN conductores c ON c.id = d.conductor_id
           WHERE d.id = $1 AND c.usuario_id = $2`,
          [despachoId, usuarioId],
        );
        if (!exists.rowCount) throw new AppError(403, "DESPACHO_NO_ASIGNADO", "El despacho no está asignado a su cuenta");
        throw new AppError(409, "LLEGADA_NO_VALIDA", "El despacho debe estar en tránsito para registrar la llegada");
      }
      await audit(client, { id: usuarioId, email: "", nombre: "Conductor autenticado", rol: "CONDUCTOR" }, "DESPACHO_LLEGADA_CONFIRMADA", despachoId, {
        usuarioId,
        horaServidor: horaLlegada,
        metodo: "confirmacion_llegada_conductor",
      });
      return despachoFrom(result.rows[0]);
    });
  }

  async obtenerViajesActivos(): Promise<DespachoRecord[]> {
    const result = await this.pool.query<DespachoRow>(
      `SELECT * FROM despachos
       WHERE estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
       ORDER BY creado_en ASC`
    );
    return result.rows.map(despachoFrom);
  }
}
