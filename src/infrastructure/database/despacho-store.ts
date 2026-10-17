import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { DespachoRecord, DespachoRepository, ConductorDetallado } from "../../domain/repositories.js";
import type { Actor } from "../../domain/configuracion.js";
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
  hora_retorno: Date | null;
  retorno_por_usuario_id: string | null;
  estado: DespachoRecord["estado"];
  iniciado_por_usuario_id: string | null;
  iniciado_en: Date | null;
  mixer_placa?: string | null;
  mixer_marca_modelo?: string | null;
  mixer_capacidad_m3?: string | number | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  obra_direccion?: string | null;
  obra_sector?: string | null;
  obra_canton?: string | null;
  incidentes?: any[] | null;
  tipo_hormigon?: string | null;
  motivo_cancelacion?: string | null;
  cancelado_por_usuario_id?: string | null;
  cancelado_en?: Date | null;
};

type ConductorRow = { id: string; nombre_completo: string; telefono: string; disponible: boolean };
type ConductorDetalladoRow = {
  id: string;
  nombre_completo: string;
  cedula: string;
  licencia_tipo: string;
  telefono: string;
  activo: boolean;
  disponible: boolean;
  usuario_id?: string | null;
  email?: string | null;
};

const despachoFrom = (row: DespachoRow): DespachoRecord => ({
  id: row.id,
  pedidoId: row.pedido_id,
  mixerId: row.mixer_id,
  conductorId: row.conductor_id,
  volumenM3: Number(row.volumen_m3),
  horaSalida: row.hora_salida?.toISOString() ?? null,
  horaLlegada: row.hora_llegada?.toISOString() ?? null,
  llegadaPorUsuarioId: row.llegada_por_usuario_id,
  horaRetorno: row.hora_retorno?.toISOString() ?? null,
  retornoPorUsuarioId: row.retorno_por_usuario_id,
  estado: row.estado,
  iniciadoPorUsuarioId: row.iniciado_por_usuario_id,
  iniciadoEn: row.iniciado_en?.toISOString() ?? null,
  motivoCancelacion: row.motivo_cancelacion ?? null,
  canceladoPorUsuarioId: row.cancelado_por_usuario_id ?? null,
  canceladoEn: row.cancelado_en?.toISOString() ?? null,
  mixerPlaca: row.mixer_placa ?? null,
  mixerMarcaModelo: row.mixer_marca_modelo ?? null,
  mixerCapacidadM3: row.mixer_capacidad_m3 ? Number(row.mixer_capacidad_m3) : null,
  clienteNombre: row.cliente_nombre ?? null,
  clienteTelefono: row.cliente_telefono ?? null,
  obraDireccion: row.obra_direccion ?? null,
  obraSector: row.obra_sector ?? null,
  obraCanton: row.obra_canton ?? null,
  incidentes: row.incidentes ?? [],
  tipoHormigon: row.tipo_hormigon ?? null,
});

export class PgDespachoStore implements DespachoRepository {
  constructor(private readonly pool: Pool) {}

  async obtenerPedidoAprobado(pedidoId: string) {
    const result = await this.pool.query<{ volumen_m3: string }>(
      `SELECT (volumen_total_m3 - COALESCE(
         (SELECT SUM(volumen_m3) FROM despachos WHERE pedido_id = cotizaciones.id AND estado != 'CANCELADO'), 0
       )) AS volumen_m3
       FROM cotizaciones
       WHERE id = $1 AND estado = 'APROBADA' AND valida_hasta > now()`,
      [pedidoId]
    );
    return result.rows[0] ? { volumenM3: Math.max(0, Number(result.rows[0].volumen_m3)) } : null;
  }

  async obtenerConductoresDisponibles() {
    const result = await this.pool.query<ConductorRow>(
      `SELECT c.id, c.nombre_completo, c.telefono,
         NOT EXISTS (
           SELECT 1 FROM despachos d
           WHERE d.conductor_id = c.id AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
         ) AS disponible
       FROM conductores c
       WHERE c.activo
       ORDER BY c.nombre_completo`
    );
    return result.rows.map((row) => ({
      id: row.id,
      nombre: row.nombre_completo,
      telefono: row.telefono,
      disponible: row.disponible,
    }));
  }

  async obtenerTodosConductores(): Promise<ConductorDetallado[]> {
    const result = await this.pool.query<ConductorDetalladoRow>(
      `SELECT c.id, c.nombre_completo, c.cedula, c.licencia_tipo, c.telefono, c.activo, c.usuario_id, u.email,
         (c.activo AND NOT EXISTS (
           SELECT 1 FROM despachos d
           WHERE d.conductor_id = c.id AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
         )) AS disponible
       FROM conductores c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       ORDER BY c.creado_en DESC, c.nombre_completo ASC`
    );
    return result.rows.map((row) => ({
      id: row.id,
      nombreCompleto: row.nombre_completo,
      cedula: row.cedula,
      licenciaTipo: row.licencia_tipo,
      telefono: row.telefono,
      activo: row.activo,
      disponible: row.disponible,
      usuarioId: row.usuario_id ?? null,
      email: row.email ?? null,
    }));
  }

  async crearConductor(input: {
    id: string;
    nombreCompleto: string;
    cedula: string;
    licenciaTipo: string;
    telefono: string;
    email?: string;
    password?: string;
  }): Promise<ConductorDetallado> {
    return transaction(this.pool, async (client) => {
      let usuarioId: string | null = null;
      if (input.email) {
        const normalizedEmail = input.email.trim().toLowerCase();
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM usuarios WHERE email = $1",
          [normalizedEmail]
        );
        if (existing.rows[0]) {
          throw new AppError(409, "EMAIL_DUPLICADO", "Ya existe un usuario con este correo electrónico");
        }
        usuarioId = randomUUID();
        const plainPassword = input.password && input.password.trim().length >= 6
          ? input.password.trim()
          : "HormiDemo2026!Seguro";
        const passwordHash = await bcrypt.hash(plainPassword, 12);
        await client.query(
          `INSERT INTO usuarios (id, email, nombre, password_hash, rol_codigo, activo, datos_demostracion)
           VALUES ($1, $2, $3, $4, 'CONDUCTOR', true, false)`,
          [usuarioId, normalizedEmail, input.nombreCompleto, passwordHash]
        );
      }

      try {
        const result = await client.query<ConductorDetalladoRow>(
          `INSERT INTO conductores (id, nombre_completo, cedula, licencia_tipo, telefono, activo, usuario_id)
           VALUES ($1, $2, $3, $4, $5, true, $6)
           RETURNING id, nombre_completo, cedula, licencia_tipo, telefono, activo, usuario_id, true as disponible, null as email`,
          [input.id, input.nombreCompleto, input.cedula, input.licenciaTipo, input.telefono, usuarioId]
        );
        const row = result.rows[0];
        if (!row) throw new AppError(500, "ERROR_CREAR_CONDUCTOR", "No se pudo crear el conductor");
        return {
          id: row.id,
          nombreCompleto: row.nombre_completo,
          cedula: row.cedula,
          licenciaTipo: row.licencia_tipo,
          telefono: row.telefono,
          activo: row.activo,
          disponible: true,
          usuarioId,
          email: input.email ? input.email.trim().toLowerCase() : null,
        };
      } catch (err: any) {
        if (err?.code === "23505") {
          throw new AppError(409, "CEDULA_DUPLICADA", "Ya existe un conductor registrado con esta cédula");
        }
        throw err;
      }
    });
  }

  async actualizarConductor(
    id: string,
    input: {
      nombreCompleto?: string;
      cedula?: string;
      licenciaTipo?: string;
      telefono?: string;
      activo?: boolean;
      email?: string;
      password?: string;
    }
  ): Promise<ConductorDetallado> {
    return transaction(this.pool, async (client) => {
      const prev = await client.query<{ id: string; usuario_id: string | null; nombre_completo: string }>(
        "SELECT id, usuario_id, nombre_completo FROM conductores WHERE id = $1",
        [id]
      );
      if (!prev.rows[0]) throw new AppError(404, "CONDUCTOR_NO_ENCONTRADO", "Conductor no encontrado");
      let usuarioId = prev.rows[0].usuario_id;
      const nombreActual = input.nombreCompleto ?? prev.rows[0].nombre_completo;

      if (input.email) {
        const normalizedEmail = input.email.trim().toLowerCase();
        if (usuarioId) {
          const conflict = await client.query<{ id: string }>(
            "SELECT id FROM usuarios WHERE email = $1 AND id <> $2",
            [normalizedEmail, usuarioId]
          );
          if (conflict.rows[0]) {
            throw new AppError(409, "EMAIL_DUPLICADO", "Ya existe otro usuario con este correo electrónico");
          }
          let passwordSql = "";
          const params: any[] = [usuarioId, normalizedEmail, nombreActual, input.activo ?? true];
          if (input.password && input.password.trim().length >= 6) {
            const hash = await bcrypt.hash(input.password.trim(), 12);
            params.push(hash);
            passwordSql = ", password_hash = $5";
          }
          await client.query(
            `UPDATE usuarios
             SET email = $2, nombre = $3, activo = $4${passwordSql}, actualizado_en = now()
             WHERE id = $1`,
            params
          );
        } else {
          const conflict = await client.query<{ id: string }>(
            "SELECT id FROM usuarios WHERE email = $1",
            [normalizedEmail]
          );
          if (conflict.rows[0]) {
            throw new AppError(409, "EMAIL_DUPLICADO", "Ya existe un usuario con este correo electrónico");
          }
          usuarioId = randomUUID();
          const plainPassword = input.password && input.password.trim().length >= 6
            ? input.password.trim()
            : "HormiDemo2026!Seguro";
          const passwordHash = await bcrypt.hash(plainPassword, 12);
          await client.query(
            `INSERT INTO usuarios (id, email, nombre, password_hash, rol_codigo, activo, datos_demostracion)
             VALUES ($1, $2, $3, $4, 'CONDUCTOR', $5, false)`,
            [usuarioId, normalizedEmail, nombreActual, passwordHash, input.activo ?? true]
          );
          await client.query("UPDATE conductores SET usuario_id = $1 WHERE id = $2", [usuarioId, id]);
        }
      } else if (usuarioId) {
        if (input.password && input.password.trim().length >= 6) {
          const hash = await bcrypt.hash(input.password.trim(), 12);
          await client.query(
            "UPDATE usuarios SET password_hash = $1, actualizado_en = now() WHERE id = $2",
            [hash, usuarioId]
          );
        }
        if (input.nombreCompleto !== undefined || input.activo !== undefined) {
          await client.query(
            `UPDATE usuarios
             SET nombre = COALESCE($2, nombre), activo = COALESCE($3, activo), actualizado_en = now()
             WHERE id = $1`,
            [usuarioId, input.nombreCompleto ?? null, input.activo ?? null]
          );
        }
      }

      try {
        const result = await client.query<ConductorDetalladoRow>(
          `UPDATE conductores
           SET
             nombre_completo = COALESCE($2, nombre_completo),
             cedula = COALESCE($3, cedula),
             licencia_tipo = COALESCE($4, licencia_tipo),
             telefono = COALESCE($5, telefono),
             activo = COALESCE($6, activo),
             usuario_id = COALESCE($7, usuario_id)
           WHERE id = $1
           RETURNING id, nombre_completo, cedula, licencia_tipo, telefono, activo, usuario_id,
             (activo AND NOT EXISTS (
               SELECT 1 FROM despachos d
               WHERE d.conductor_id = conductores.id AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA')
             )) AS disponible,
             (SELECT email FROM usuarios WHERE id = conductores.usuario_id) AS email`,
          [id, input.nombreCompleto ?? null, input.cedula ?? null, input.licenciaTipo ?? null, input.telefono ?? null, input.activo ?? null, usuarioId]
        );
        const row = result.rows[0];
        if (!row) throw new AppError(500, "ERROR_ACTUALIZAR_CONDUCTOR", "No se pudo actualizar el conductor");
        return {
          id: row.id,
          nombreCompleto: row.nombre_completo,
          cedula: row.cedula,
          licenciaTipo: row.licencia_tipo,
          telefono: row.telefono,
          activo: row.activo,
          disponible: row.disponible,
          usuarioId: row.usuario_id,
          email: row.email,
        };
      } catch (err: any) {
        if (err?.code === "23505") {
          throw new AppError(409, "CEDULA_DUPLICADA", "Ya existe otro conductor registrado con esta cédula");
        }
        throw err;
      }
    });
  }

  async cambiarEstadoConductor(id: string, activo: boolean): Promise<ConductorDetallado> {
    return this.actualizarConductor(id, { activo });
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
      `SELECT d.*,
              m.placa AS mixer_placa,
              m.marca_modelo AS mixer_marca_modelo,
              m.capacidad_m3 AS mixer_capacidad_m3,
              cli.nombre AS cliente_nombre,
              cli.telefono AS cliente_telefono,
              (cot.snapshot->'obra'->>'direccion') AS obra_direccion,
              (cot.snapshot->'calculo'->'zona'->>'sector') AS obra_sector,
              (cot.snapshot->'calculo'->'zona'->>'canton') AS obra_canton,
              CASE
                WHEN jsonb_typeof(cot.snapshot->'calculo'->'detalles') = 'array' AND jsonb_array_length(cot.snapshot->'calculo'->'detalles') > 0
                THEN 'f''c ' || (cot.snapshot->'calculo'->'detalles'->0->>'fcKgfCm2') || ' - ' || (cot.snapshot->'calculo'->'detalles'->0->>'elementoNombre')
                ELSE NULL
              END AS tipo_hormigon
       FROM despachos d
       JOIN conductores c ON c.id = d.conductor_id
       LEFT JOIN camiones_mixer m ON m.codigo = d.mixer_id
       LEFT JOIN cotizaciones cot ON cot.id = d.pedido_id
       LEFT JOIN clientes cli ON cli.id = cot.cliente_id
      WHERE c.usuario_id = $1
        AND d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA', 'ENTREGADO')
      ORDER BY CASE WHEN d.estado = 'ENTREGADO' THEN 1 ELSE 0 END,
               d.creado_en DESC
      LIMIT 1`,
      [usuarioId],
    );
    return result.rows[0] ? despachoFrom(result.rows[0]) : null;
  }

  async obtenerHistorialViajesDelConductor(usuarioId: string): Promise<DespachoRecord[]> {
    const result = await this.pool.query<DespachoRow>(
      `SELECT d.*,
              m.placa AS mixer_placa,
              m.marca_modelo AS mixer_marca_modelo,
              m.capacidad_m3 AS mixer_capacidad_m3,
              cli.nombre AS cliente_nombre,
              cli.telefono AS cliente_telefono,
              (cot.snapshot->'obra'->>'direccion') AS obra_direccion,
              (cot.snapshot->'calculo'->'zona'->>'sector') AS obra_sector,
              (cot.snapshot->'calculo'->'zona'->>'canton') AS obra_canton,
              CASE
                WHEN jsonb_typeof(cot.snapshot->'calculo'->'detalles') = 'array' AND jsonb_array_length(cot.snapshot->'calculo'->'detalles') > 0
                THEN 'f''c ' || (cot.snapshot->'calculo'->'detalles'->0->>'fcKgfCm2') || ' - ' || (cot.snapshot->'calculo'->'detalles'->0->>'elementoNombre')
                ELSE NULL
              END AS tipo_hormigon
       FROM despachos d
       JOIN conductores c ON c.id = d.conductor_id
       LEFT JOIN camiones_mixer m ON m.codigo = d.mixer_id
       LEFT JOIN cotizaciones cot ON cot.id = d.pedido_id
       LEFT JOIN clientes cli ON cli.id = cot.cliente_id
      WHERE c.usuario_id = $1
      ORDER BY d.creado_en DESC`,
      [usuarioId],
    );
    return result.rows.map(despachoFrom);
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
      const enriched = await this.obtenerDespachoEnriquecidoPorId(client, despachoId);
      return despachoFrom(enriched ?? result.rows[0]);
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
      const enriched = await this.obtenerDespachoEnriquecidoPorId(client, despachoId);
      return despachoFrom(enriched ?? result.rows[0]);
    });
  }

  async registrarRetornoComoConductor(despachoId: string, usuarioId: string, horaRetorno: string) {
    return transaction(this.pool, async (client) => {
      const result = await client.query<DespachoRow>(
        `UPDATE despachos d
         SET hora_retorno = $3, retorno_por_usuario_id = $2,
             estado = 'ENTREGADO', actualizado_en = $3
         FROM conductores c
         WHERE d.id = $1 AND c.id = d.conductor_id AND c.usuario_id = $2
           AND d.estado = 'EN_OBRA'
         RETURNING d.*`,
        [despachoId, usuarioId, horaRetorno],
      );
      if (!result.rows[0]) {
        const exists = await client.query(
          `SELECT d.estado FROM despachos d
           JOIN conductores c ON c.id = d.conductor_id
           WHERE d.id = $1 AND c.usuario_id = $2`,
          [despachoId, usuarioId],
        );
        if (!exists.rowCount) throw new AppError(403, "DESPACHO_NO_ASIGNADO", "El despacho no está asignado a su cuenta");
        throw new AppError(409, "RETORNO_NO_VALIDO", "Debe confirmar la llegada a obra antes de registrar el retorno a la hormigonera");
      }
      await audit(client, { id: usuarioId, email: "", nombre: "Conductor autenticado", rol: "CONDUCTOR" }, "DESPACHO_RETORNO_CONFIRMADO", despachoId, {
        usuarioId,
        horaServidor: horaRetorno,
        metodo: "confirmacion_retorno_hormigonera",
      });
      const enriched = await this.obtenerDespachoEnriquecidoPorId(client, despachoId);
      return despachoFrom(enriched ?? result.rows[0]);
    });
  }

  async reportarIncidente(despachoId: string, input: { tipo: string; descripcion: string }, actor: Actor): Promise<DespachoRecord> {
    return transaction(this.pool, async (client) => {
      const incidenteItem = {
        id: randomUUID(),
        fecha: new Date().toISOString(),
        tipo: input.tipo,
        descripcion: input.descripcion,
        usuarioNombre: actor.nombre,
      };
      const result = await client.query<DespachoRow>(
        `UPDATE despachos
         SET incidentes = COALESCE(incidentes, '[]'::jsonb) || $2::jsonb,
             actualizado_en = now()
         WHERE id = $1
         RETURNING *`,
        [despachoId, JSON.stringify([incidenteItem])]
      );
      if (!result.rows[0]) throw new AppError(404, "DESPACHO_NO_ENCONTRADO", "Despacho no encontrado");
      await audit(client, actor, "INCIDENTE_DESPACHO_REPORTADO", despachoId, incidenteItem);
      // Fetch enriched row if possible
      const enriched = await client.query<DespachoRow>(
        `SELECT d.*,
                m.placa AS mixer_placa,
                m.marca_modelo AS mixer_marca_modelo,
                m.capacidad_m3 AS mixer_capacidad_m3,
                cli.nombre AS cliente_nombre,
                cli.telefono AS cliente_telefono,
                (cot.snapshot->'obra'->>'direccion') AS obra_direccion,
                (cot.snapshot->'calculo'->'zona'->>'sector') AS obra_sector,
                (cot.snapshot->'calculo'->'zona'->>'canton') AS obra_canton,
                CASE
                  WHEN jsonb_typeof(cot.snapshot->'calculo'->'detalles') = 'array' AND jsonb_array_length(cot.snapshot->'calculo'->'detalles') > 0
                  THEN 'f''c ' || (cot.snapshot->'calculo'->'detalles'->0->>'fcKgfCm2') || ' - ' || (cot.snapshot->'calculo'->'detalles'->0->>'elementoNombre')
                  ELSE NULL
                END AS tipo_hormigon
         FROM despachos d
         LEFT JOIN camiones_mixer m ON m.codigo = d.mixer_id
         LEFT JOIN cotizaciones cot ON cot.id = d.pedido_id
         LEFT JOIN clientes cli ON cli.id = cot.cliente_id
         WHERE d.id = $1`,
        [despachoId]
      );
      return despachoFrom(enriched.rows[0] ?? result.rows[0]);
    });
  }

  async cancelarDespacho(despachoId: string, motivo: string, actor: Actor): Promise<DespachoRecord> {
    return transaction(this.pool, async (client) => {
      if (actor.rol === "CONDUCTOR") {
        const belongs = await client.query(
          `SELECT 1 FROM despachos d
           JOIN conductores c ON c.id = d.conductor_id
           WHERE d.id = $1 AND c.usuario_id = $2`,
          [despachoId, actor.id]
        );
        if (!belongs.rowCount) {
          throw new AppError(403, "DESPACHO_NO_ASIGNADO", "El despacho no está asignado a su cuenta");
        }
      }

      const current = await client.query<{ estado: string }>(
        `SELECT estado FROM despachos WHERE id = $1`,
        [despachoId]
      );
      if (!current.rowCount) {
        throw new AppError(404, "DESPACHO_NO_ENCONTRADO", "Despacho no encontrado");
      }
      if (current.rows[0]!.estado === "ENTREGADO") {
        throw new AppError(409, "DESPACHO_YA_ENTREGADO", "No se puede cancelar un despacho que ya fue entregado con éxito");
      }
      if (current.rows[0]!.estado === "CANCELADO") {
        throw new AppError(409, "DESPACHO_YA_CANCELADO", "El despacho ya se encuentra cancelado");
      }

      const result = await client.query<DespachoRow>(
        `UPDATE despachos
         SET estado = 'CANCELADO',
             motivo_cancelacion = $2,
             cancelado_por_usuario_id = $3,
             cancelado_en = now(),
             actualizado_en = now()
         WHERE id = $1
         RETURNING *`,
        [despachoId, motivo, actor.id]
      );

      await audit(client, actor, "DESPACHO_CANCELADO", despachoId, {
        motivo,
        estadoPrevio: current.rows[0]!.estado,
      });

      const enriched = await this.obtenerDespachoEnriquecidoPorId(client, despachoId);
      return despachoFrom(enriched ?? result.rows[0]!);
    });
  }

  async obtenerViajesActivos(): Promise<DespachoRecord[]> {
    const result = await this.pool.query<DespachoRow>(
      `SELECT d.*,
              m.placa AS mixer_placa,
              m.marca_modelo AS mixer_marca_modelo,
              m.capacidad_m3 AS mixer_capacidad_m3,
              cli.nombre AS cliente_nombre,
              cli.telefono AS cliente_telefono,
              (cot.snapshot->'obra'->>'direccion') AS obra_direccion,
              (cot.snapshot->'calculo'->'zona'->>'sector') AS obra_sector,
              (cot.snapshot->'calculo'->'zona'->>'canton') AS obra_canton,
              CASE
                WHEN jsonb_typeof(cot.snapshot->'calculo'->'detalles') = 'array' AND jsonb_array_length(cot.snapshot->'calculo'->'detalles') > 0
                THEN 'f''c ' || (cot.snapshot->'calculo'->'detalles'->0->>'fcKgfCm2') || ' - ' || (cot.snapshot->'calculo'->'detalles'->0->>'elementoNombre')
                ELSE NULL
              END AS tipo_hormigon
       FROM despachos d
       LEFT JOIN camiones_mixer m ON m.codigo = d.mixer_id
       LEFT JOIN cotizaciones cot ON cot.id = d.pedido_id
       LEFT JOIN clientes cli ON cli.id = cot.cliente_id
       WHERE d.estado IN ('PENDIENTE', 'EN_TRANSITO', 'EN_OBRA', 'ENTREGADO', 'CANCELADO')
       ORDER BY d.creado_en DESC`
    );
    return result.rows.map(despachoFrom);
  }

  private async obtenerDespachoEnriquecidoPorId(
    client: { query: <R extends import("pg").QueryResultRow = any>(queryText: string, values?: any[]) => Promise<import("pg").QueryResult<R>> },
    despachoId: string
  ): Promise<DespachoRow | null> {
    const res = await client.query<DespachoRow>(
      `SELECT d.*,
              m.placa AS mixer_placa,
              m.marca_modelo AS mixer_marca_modelo,
              m.capacidad_m3 AS mixer_capacidad_m3,
              cli.nombre AS cliente_nombre,
              cli.telefono AS cliente_telefono,
              (cot.snapshot->'obra'->>'direccion') AS obra_direccion,
              (cot.snapshot->'calculo'->'zona'->>'sector') AS obra_sector,
              (cot.snapshot->'calculo'->'zona'->>'canton') AS obra_canton,
              CASE
                WHEN jsonb_typeof(cot.snapshot->'calculo'->'detalles') = 'array' AND jsonb_array_length(cot.snapshot->'calculo'->'detalles') > 0
                THEN 'f''c ' || (cot.snapshot->'calculo'->'detalles'->0->>'fcKgfCm2') || ' - ' || (cot.snapshot->'calculo'->'detalles'->0->>'elementoNombre')
                ELSE NULL
              END AS tipo_hormigon
       FROM despachos d
       LEFT JOIN camiones_mixer m ON m.codigo = d.mixer_id
       LEFT JOIN cotizaciones cot ON cot.id = d.pedido_id
       LEFT JOIN clientes cli ON cli.id = cot.cliente_id
       WHERE d.id = $1`,
      [despachoId]
    );
    return res.rows[0] ?? null;
  }
}
