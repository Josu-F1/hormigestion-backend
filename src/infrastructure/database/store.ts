import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { configurationSchema, type Actor, type Configuration, type VersionedConfiguration } from "../../domain/configuracion.js";
import { stateAt, type Quotation, type QuotationState } from "../../domain/cotizacion.js";
import { AppError } from "../../domain/errors.js";
import type { ConfigurationRepository, NewUser, PublicUser, QuotationRepository, SavedQuotation, UserChanges, UserRecord, UserRepository } from "../../domain/repositories.js";
import { transaction } from "./pool.js";

type ConfigRow = { version: number; contenido: unknown; creado_en: Date; motivo: string };
type UserRow = { id: string; email: string; nombre: string; rol_codigo: UserRecord["rol"]; password_hash: string; activo: boolean; datos_demostracion: boolean };
type QuoteRow = { snapshot: Quotation; estado: QuotationState; version: number; token_acceso_hash: string; solicitud_hash?: string };
const configFrom = (row: ConfigRow): VersionedConfiguration => ({ version: row.version, configuracion: configurationSchema.parse(row.contenido), creadoEn: row.creado_en.toISOString(), motivo: row.motivo });
const userFrom = (row: UserRow): UserRecord => ({ id: row.id, email: row.email, nombre: row.nombre, rol: row.rol_codigo, passwordHash: row.password_hash, activo: row.activo, datosDemostracion: row.datos_demostracion });
export const publicUser = ({ passwordHash: _password, ...user }: UserRecord): PublicUser => user;
const quoteFrom = (row: QuoteRow): SavedQuotation => ({ cotizacion: { ...row.snapshot, estado: row.estado, version: row.version }, tokenHash: row.token_acceso_hash });

export async function currentConfiguration(db: Pool | PoolClient, lock = false) {
  const result = await db.query<ConfigRow>(`SELECT v.version,v.contenido,v.creado_en,v.motivo FROM configuracion_actual a JOIN configuracion_versiones v ON v.version=a.version WHERE a.id=1 ${lock ? "FOR SHARE OF a" : ""}`);
  if (!result.rows[0]) throw new AppError(503, "CONFIGURACION_PENDIENTE", "Inicialice la configuración antes de atender solicitudes");
  return configFrom(result.rows[0]);
}

export async function writeCatalogs(client: PoolClient, config: Configuration, version: number) {
  for (const item of config.resistencias) await client.query(
    `INSERT INTO resistencias(codigo,fc_kgf_cm2,precio_m3,slump_objetivo_mm,agregado_max_mm,descripcion,activo,version_configuracion) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(codigo) DO UPDATE SET fc_kgf_cm2=EXCLUDED.fc_kgf_cm2,precio_m3=EXCLUDED.precio_m3,slump_objetivo_mm=EXCLUDED.slump_objetivo_mm,agregado_max_mm=EXCLUDED.agregado_max_mm,descripcion=EXCLUDED.descripcion,activo=EXCLUDED.activo,version_configuracion=EXCLUDED.version_configuracion`,
    [item.codigo, item.fcKgfCm2, item.precioM3, item.slumpObjetivoMm, item.agregadoMaxMm, item.descripcion, item.activo, version]);
  for (const item of config.elementos) await client.query(
    `INSERT INTO elementos_constructivos(codigo,nombre,desperdicio_sugerido_pct,geometria,activo,version_configuracion) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(codigo) DO UPDATE SET nombre=EXCLUDED.nombre,desperdicio_sugerido_pct=EXCLUDED.desperdicio_sugerido_pct,geometria=EXCLUDED.geometria,activo=EXCLUDED.activo,version_configuracion=EXCLUDED.version_configuracion`,
    [item.codigo, item.nombre, item.desperdicioSugeridoPct, item.geometria, item.activo, version]);
  for (const item of config.zonasFlete) await client.query(
    `INSERT INTO zonas_flete(codigo,canton,sector,distancia_km,traslado_estimado_min,tarifa_flete_m3,activo,version_configuracion) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(codigo) DO UPDATE SET canton=EXCLUDED.canton,sector=EXCLUDED.sector,distancia_km=EXCLUDED.distancia_km,traslado_estimado_min=EXCLUDED.traslado_estimado_min,tarifa_flete_m3=EXCLUDED.tarifa_flete_m3,activo=EXCLUDED.activo,version_configuracion=EXCLUDED.version_configuracion`,
    [item.codigo, item.canton, item.sector, item.distanciaKm, item.trasladoEstimadoMin, item.tarifaFleteM3, item.activo, version]);
  for (const item of config.mixers) await client.query(
    `INSERT INTO camiones_mixer(codigo,placa,marca_modelo,capacidad_m3,estado,version_configuracion) VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(codigo) DO UPDATE SET placa=EXCLUDED.placa,marca_modelo=EXCLUDED.marca_modelo,capacidad_m3=EXCLUDED.capacidad_m3,estado=EXCLUDED.estado,version_configuracion=EXCLUDED.version_configuracion`,
    [item.codigo, item.placa.toUpperCase(), item.marcaModelo, item.capacidadM3, item.estado, version]);
}

export async function audit(client: PoolClient, actor: Actor | null, action: string, resource: string, data: unknown) {
  await client.query("INSERT INTO auditoria_eventos(id,autor_id,accion,recurso_id,datos) VALUES($1,$2,$3,$4,$5)", [randomUUID(), actor?.id ?? null, action, resource, JSON.stringify(data)]);
}

export class PgStore implements ConfigurationRepository, UserRepository, QuotationRepository {
  constructor(private readonly pool: Pool) {}
  current() { return currentConfiguration(this.pool); }

  async history() {
    const result = await this.pool.query<{ version: number; motivo: string; creado_en: Date; autor_id: string | null }>("SELECT version,motivo,creado_en,autor_id FROM configuracion_versiones ORDER BY version DESC LIMIT 100");
    return result.rows.map((row) => ({ version: row.version, motivo: row.motivo, creadoEn: row.creado_en.toISOString(), autorId: row.autor_id }));
  }

  async update(config: Configuration, expectedVersion: number, reason: string, actor: Actor) {
    return transaction(this.pool, async (client) => {
      const locked = await client.query("SELECT version FROM configuracion_actual WHERE id=1 FOR UPDATE");
      if (locked.rows[0]?.version !== expectedVersion) throw new AppError(409, "VERSION_CONFIGURACION_DESACTUALIZADA", "Otro usuario cambió la configuración; vuelva a cargarla");
      const previous = await currentConfiguration(client);
      for (const key of ["resistencias", "elementos", "zonasFlete", "mixers"] as const) {
        const incoming = new Set(config[key].map((item) => item.codigo));
        if (previous.configuracion[key].some((item) => !incoming.has(item.codigo))) throw new AppError(422, "CATALOGO_NO_ELIMINABLE", "Conserve los códigos existentes; desactive registros en vez de eliminarlos");
      }
      const result = await client.query<ConfigRow>("INSERT INTO configuracion_versiones(contenido,motivo,autor_id) VALUES($1,$2,$3) RETURNING version,contenido,creado_en,motivo", [JSON.stringify(config), reason, actor.id]);
      const current = configFrom(result.rows[0]!);
      await writeCatalogs(client, config, current.version);
      await client.query("UPDATE configuracion_actual SET version=$1 WHERE id=1", [current.version]);
      await audit(client, actor, "CONFIGURACION_ACTUALIZADA", "configuracion", { versionAnterior: previous.version, versionNueva: current.version, motivo: reason });
      return current;
    });
  }

  async findUserByEmail(email: string) {
    const result = await this.pool.query<UserRow>("SELECT * FROM usuarios WHERE email=$1", [email]);
    return result.rows[0] ? userFrom(result.rows[0]) : null;
  }
  async findUserById(id: string) {
    const result = await this.pool.query<UserRow>("SELECT * FROM usuarios WHERE id=$1", [id]);
    return result.rows[0] ? userFrom(result.rows[0]) : null;
  }
  async users() {
    const result = await this.pool.query<UserRow>("SELECT * FROM usuarios ORDER BY nombre LIMIT 500");
    return result.rows.map((row) => publicUser(userFrom(row)));
  }
  async createUser(user: NewUser, actor: Actor) {
    return transaction(this.pool, async (client) => {
      const result = await client.query<UserRow>("INSERT INTO usuarios(id,email,nombre,password_hash,rol_codigo,activo,datos_demostracion) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *", [user.id, user.email, user.nombre, user.passwordHash, user.rol, user.activo, user.datosDemostracion]);
      const created = publicUser(userFrom(result.rows[0]!));
      await audit(client, actor, "USUARIO_CREADO", created.id, created);
      return created;
    });
  }
  async updateUser(id: string, changes: UserChanges, actor: Actor) {
    return transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('hormigestion:administradores'))");
      const found = await client.query<UserRow>("SELECT * FROM usuarios WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rows[0]) throw new AppError(404, "USUARIO_NO_ENCONTRADO", "Usuario no encontrado");
      const before = userFrom(found.rows[0]);
      const next = { ...before, ...changes };
      if (before.activo && before.rol === "ADMINISTRADOR" && (!next.activo || next.rol !== "ADMINISTRADOR")) {
        const administrators = await client.query("SELECT id FROM usuarios WHERE activo=true AND rol_codigo='ADMINISTRADOR' AND id<>$1", [id]);
        if (!administrators.rowCount) throw new AppError(409, "ULTIMO_ADMINISTRADOR", "Debe conservar al menos un administrador activo");
      }
      const result = await client.query<UserRow>("UPDATE usuarios SET nombre=$2,rol_codigo=$3,activo=$4,password_hash=$5,actualizado_en=now() WHERE id=$1 RETURNING *", [id, next.nombre, next.rol, next.activo, next.passwordHash]);
      const updated = publicUser(userFrom(result.rows[0]!));
      await audit(client, actor, "USUARIO_ACTUALIZADO", id, { antes: publicUser(before), despues: updated, claveCambiada: changes.passwordHash !== undefined });
      return updated;
    });
  }

  async createQuotation(keyHash: string, inputHash: string, build: (config: VersionedConfiguration) => SavedQuotation) {
    return transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`hormigestion:cotizacion:${keyHash}`]);
      const previous = await client.query<QuoteRow>("SELECT snapshot,estado,version,token_acceso_hash,solicitud_hash FROM cotizaciones WHERE idempotency_hash=$1", [keyHash]);
      if (previous.rows[0]) {
        if (previous.rows[0].solicitud_hash !== inputHash) throw new AppError(409, "CLAVE_IDEMPOTENCIA_REUTILIZADA", "La clave ya pertenece a otra solicitud");
        return { cotizacion: quoteFrom(previous.rows[0]).cotizacion, replayed: true };
      }
      const current = await currentConfiguration(client, true);
      const { cotizacion: quote, tokenHash } = build(current);
      const customerId = randomUUID();
      await client.query("INSERT INTO clientes(id,nombre,telefono,email,datos_demostracion) VALUES($1,$2,$3,$4,$5)", [customerId, quote.contacto.nombre, quote.contacto.telefono, quote.contacto.email ?? null, quote.calculo.datosDemostracion]);
      await client.query(`INSERT INTO cotizaciones(id,codigo,cliente_id,zona_codigo,version_configuracion,estado,version,datos_demostracion,volumen_total_m3,total,snapshot,idempotency_hash,solicitud_hash,token_acceso_hash,valida_hasta,acceso_expira_en,creado_en)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [quote.id, quote.codigo, customerId, quote.calculo.zona.codigo, current.version, quote.estado, quote.version, quote.calculo.datosDemostracion, quote.calculo.volumenTotalM3, quote.calculo.total, JSON.stringify(quote), keyHash, inputHash, tokenHash, quote.validaHasta, quote.accesoExpiraEn, quote.creadoEn]);
      for (const [position, detail] of quote.calculo.detalles.entries()) await client.query(`INSERT INTO detalles_cotizacion(id,cotizacion_id,posicion,elemento_codigo,resistencia_codigo,cantidad,volumen_neto_m3,volumen_total_m3,desperdicio_pct,precio_unitario_m3,subtotal_hormigon,snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [randomUUID(), quote.id, position, detail.elementoCodigo, detail.resistenciaCodigo, detail.cantidad, detail.volumenNetoM3, detail.volumenTotalM3, detail.desperdicioPct, detail.precioUnitarioM3, detail.subtotalHormigon, JSON.stringify(detail)]);
      await client.query("INSERT INTO eventos_salida(id,tipo,recurso_id,deduplicacion,payload) VALUES($1,$2,$3,$4,$5)", [randomUUID(), "COTIZACION_SOLICITADA", quote.id, `cotizacion-solicitada:${quote.id}`, JSON.stringify({ cotizacionId: quote.id, codigo: quote.codigo })]);
      await audit(client, null, "COTIZACION_SOLICITADA", quote.id, { versionConfiguracion: current.version, datosDemostracion: quote.calculo.datosDemostracion });
      return { cotizacion: quote, replayed: false };
    });
  }
  async quotation(id: string) {
    const result = await this.pool.query<QuoteRow>("SELECT snapshot,estado,version,token_acceso_hash FROM cotizaciones WHERE id=$1", [id]);
    return result.rows[0] ? quoteFrom(result.rows[0]) : null;
  }
  async quotations(limit: number, offset: number) {
    const result = await this.pool.query<QuoteRow>("SELECT snapshot,estado,version,token_acceso_hash FROM cotizaciones ORDER BY creado_en DESC,id LIMIT $1 OFFSET $2", [limit, offset]);
    return result.rows.map((row) => quoteFrom(row).cotizacion);
  }
  async changeQuotationState(id: string, target: QuotationState, expectedVersion: number, reason: string, actor: Actor, now: Date) {
    return transaction(this.pool, async (client) => {
      const found = await client.query<QuoteRow>("SELECT snapshot,estado,version,token_acceso_hash FROM cotizaciones WHERE id=$1 FOR UPDATE", [id]);
      if (!found.rows[0]) throw new AppError(404, "COTIZACION_NO_ENCONTRADA", "Cotización no encontrada");
      const before = quoteFrom(found.rows[0]).cotizacion;
      const effective = stateAt(before, now);
      if (effective === target) return { ...before, estado: effective };
      if (before.version !== expectedVersion) throw new AppError(409, "VERSION_COTIZACION_DESACTUALIZADA", "La cotización cambió; vuelva a cargarla");
      const allowed: Partial<Record<QuotationState, QuotationState[]>> = { PENDIENTE: ["CONTACTADA", "RECHAZADA"], CONTACTADA: ["APROBADA", "RECHAZADA"] };
      if (!allowed[effective]?.includes(target)) throw new AppError(409, "TRANSICION_NO_PERMITIDA", "Acción incompatible con el estado o vigencia de la cotización");
      await client.query("UPDATE cotizaciones SET estado=$2,version=version+1,actualizado_en=$3 WHERE id=$1", [id, target, now]);
      await audit(client, actor, "COTIZACION_ESTADO", id, { antes: effective, despues: target, motivo: reason });
      return { ...before, estado: target, version: before.version + 1 };
    });
  }
}
