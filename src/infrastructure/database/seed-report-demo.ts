import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { addDays, localDate, monday } from "../../domain/reporteria.js";
import { calculateQuotation, calculationSchema, type Quotation, type QuotationState } from "../../domain/cotizacion.js";
import { loadEnv } from "../env.js";
import { createPool, transaction } from "./pool.js";
import { audit, currentConfiguration } from "./store.js";

const marker = "reporteria-demo-v1";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Historial ficticio: una transacción, orígenes separados y ninguna sobrescritura. */
export async function seedReportDemo(pool: Pool, now = new Date()) {
  return transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [marker]);
    const current = await currentConfiguration(client, true);
    if (!current.configuracion.datosDemostracion) throw new Error("El historial demo requiere una configuración marcada como demostración");
    if ((await client.query("SELECT 1 FROM auditoria_eventos WHERE accion='REPORTERIA_DEMO_INICIALIZADA' AND recurso_id=$1", [marker])).rowCount) return 0;
    const config = current.configuracion;
    const resistances = config.resistencias.filter((item) => item.activo);
    const zones = config.zonasFlete.filter((item) => item.activo);
    const element = config.elementos.find((item) => item.activo && item.geometria === "VOLUMEN_DIRECTO");
    if (!element) throw new Error("Se necesita un elemento activo de volumen directo");
    const today = localDate(now, config.planta.zonaHoraria);
    const week = monday(today);
    const customerId = randomUUID();
    await client.query("INSERT INTO clientes(id,nombre,telefono,email,datos_demostracion) VALUES($1,$2,$3,$4,true)", [customerId, "Clientes sintéticos de reportería DEMO", "0000000000", "historial@example.invalid"]);
    const weighted = [1, 1, 2, 0, 1, 3, 2, 1, 4, 0];
    let count = 0;
    for (let w = 0; w <= 12; w++) {
      const number = w === 12 ? 6 : 12 + (w % 4) * 2 + Math.floor(w / 4);
      for (let index = 0; index < number; index++) {
        const date = w === 12 ? addDays(today, -1 - index % 3) : addDays(week, (w - 12) * 7 + index % 6);
        const created = new Date(`${date}T${14 + index % 5}:00:00Z`);
        const selected = resistances[weighted[(index + w) % weighted.length]! % resistances.length]!;
        const zone = zones[[0, 0, 2, 1, 4, 3, 0, 5][index % 8]! % zones.length]!;
        const input = calculationSchema.parse({ zonaCodigo: zone.codigo, requiereBombeo: index % 3 === 0 && config.comercial.bombeo.habilitado,
          detalles: [{ elementoCodigo: element.codigo, resistenciaCodigo: selected.codigo, cantidad: 1,
            medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: ((8 + (index * 7 + w * 3) % 42 + w * 0.5) * (w === 11 ? 1.35 : 1)).toFixed(3) } },
            ...(index % 4 === 0 ? [{ elementoCodigo: element.codigo, resistenciaCodigo: resistances[2 % resistances.length]!.codigo, cantidad: 1, medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: "5" } }] : [])] });
        const id = randomUUID();
        const state: QuotationState = w === 12 ? (index % 2 ? "CONTACTADA" : "PENDIENTE") : ["APROBADA", "APROBADA", "APROBADA", "RECHAZADA", "PENDIENTE"][index % 5] as QuotationState;
        const quote: Quotation = {
          id, codigo: `COT-DEMO-REP-${date}-${w}-${index}`, estado: state, version: 1, creadoEn: created.toISOString(),
          validaHasta: new Date(created.getTime() + config.comercial.vigenciaDias * 86400000).toISOString(),
          accesoExpiraEn: new Date(created.getTime() + config.comercial.diasAccesoComprobante * 86400000).toISOString(),
          contacto: { nombre: "Clientes sintéticos de reportería DEMO", telefono: "0000000000", email: "historial@example.invalid" },
          obra: { direccion: "Obra ficticia usada exclusivamente en reportería DEMO", fechaPreferida: addDays(date, 5) },
          calculo: calculateQuotation(input, config, current.version), politicaEntrega: config.calidad,
        };
        await client.query(`INSERT INTO cotizaciones(id,codigo,cliente_id,zona_codigo,version_configuracion,estado,version,datos_demostracion,volumen_total_m3,total,snapshot,idempotency_hash,solicitud_hash,token_acceso_hash,valida_hasta,acceso_expira_en,creado_en)
          VALUES($1,$2,$3,$4,$5,$6,1,true,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [id, quote.codigo, customerId, zone.codigo, current.version, state, quote.calculo.volumenTotalM3, quote.calculo.total, JSON.stringify(quote), hash(`${marker}:${w}:${index}`), hash(JSON.stringify(input)), hash(randomUUID()), quote.validaHasta, quote.accesoExpiraEn, created]);
        for (const [position, detail] of quote.calculo.detalles.entries()) await client.query(`INSERT INTO detalles_cotizacion(id,cotizacion_id,posicion,elemento_codigo,resistencia_codigo,cantidad,volumen_neto_m3,volumen_total_m3,desperdicio_pct,precio_unitario_m3,subtotal_hormigon,snapshot)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [randomUUID(), id, position, detail.elementoCodigo, detail.resistenciaCodigo, detail.cantidad, detail.volumenNetoM3, detail.volumenTotalM3, detail.desperdicioPct, detail.precioUnitarioM3, detail.subtotalHormigon, JSON.stringify(detail)]);
        count++;
      }
    }
    await audit(client, null, "REPORTERIA_DEMO_INICIALIZADA", marker, { cotizaciones: count, fechaAncla: today, datosDemostracion: true, origen: "Historial sintético; no genera pedidos, despachos ni eventos de notificación" });
    return count;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadEnv();
  if (!env.DEMO_MODE || env.NODE_ENV === "production") throw new Error("Historial demo limitado a desarrollo/pruebas con DEMO_MODE=true");
  const pool = createPool(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, 1);
  try { console.log(`Cotizaciones sintéticas añadidas: ${await seedReportDemo(pool)}. Datos y cuentas anteriores conservados.`); }
  finally { await pool.end(); }
}
