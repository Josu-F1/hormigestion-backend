import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { Decimal } from "decimal.js";
import { seedReportDemo } from "../../src/infrastructure/database/seed-report-demo.js";
import { localDate } from "../../src/domain/reporteria.js";
import { createApp } from "../../src/app.js";
import { loadEnv } from "../../src/infrastructure/env.js";
import { createPool } from "../../src/infrastructure/database/pool.js";
import { migrate } from "../../src/infrastructure/database/migrate.js";
import { seedDemo } from "../../src/infrastructure/database/seed-demo.js";
import { demoConfiguration } from "../../src/domain/demo.js";

if (!process.env.TEST_DATABASE_URL || !process.env.TEST_APP_DATABASE_URL || !/^\/hormigestion_test_[a-f0-9]+$/.test(new URL(process.env.TEST_DATABASE_URL).pathname)) throw new Error("Ejecute npm run test:integration: las pruebas requieren una base temporal aislada");
const adminDb = createPool(process.env.TEST_DATABASE_URL, 2);
const appDb = createPool(process.env.TEST_APP_DATABASE_URL, 5);
const password = "SoloPruebas_DEMO_2026!";
const env = loadEnv({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_APP_DATABASE_URL, JWT_SECRET: "secreto-de-pruebas-jwt-".repeat(3), COMPROBANTE_SECRET: "secreto-de-pruebas-comprobante-".repeat(3), LOG_LEVEL: "silent", CORS_ORIGINS: "http://localhost:5173", DEMO_MODE: "true" });
let now = new Date();
let server: Server;
let baseUrl = "";
let configVersion = 1;
let config = structuredClone(demoConfiguration);
const tokens: Record<string, string> = {};
const users: Record<string, string> = {};
let quoteId = "";
let quoteToken = "";
let quoteTotal = "";
let originalRequest: ReturnType<typeof creationInput>;
let originalKey = "";

function creationInput(version = configVersion) {
  return {
    versionConfiguracion: version, zonaCodigo: "AMBATO-HUACHI", requiereBombeo: false,
    detalles: [{ elementoCodigo: "LOSA-MACIZA", resistenciaCodigo: "FC-210", cantidad: 1, medicion: { tipo: "PRISMA", largoM: "10", anchoM: "5", altoM: "0.1" } }],
    contacto: { nombre: "Cliente ficticio DEMO", telefono: "0990000000", email: "cliente@demo.hormigestion.test" },
    obra: { direccion: "Dirección ficticia de obra DEMO", fechaPreferida: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10) },
  };
}
async function call(path: string, method = "GET", body?: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, headers: response.headers, data: await response.json() as any };
}

before(async () => {
  await migrate(adminDb, process.env.APP_DB_PASSWORD);
  server = createApp(appDb, env, { clock: () => now, rateLimits: false }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await appDb.end(); await adminDb.end();
});

test("salud distingue proceso activo de configuración pendiente", async () => {
  assert.equal((await call("/health/live")).status, 200);
  assert.equal((await call("/health/ready")).status, 503);
  assert.equal(await seedDemo(adminDb, password), true);
  assert.equal((await call("/health/ready")).status, 200);
});
test("migración y semilla repetidas conservan registros y claves", async () => {
  await migrate(adminDb, process.env.APP_DB_PASSWORD);
  assert.equal(await seedDemo(adminDb, "OtraClaveDemo_2026!"), false);
  assert.equal((await adminDb.query("SELECT count(*)::int AS n FROM usuarios")).rows[0].n, 4);
  assert.equal((await adminDb.query("SELECT count(*)::int AS n FROM configuracion_versiones")).rows[0].n, 1);
});
test("login obtiene roles reales; personal activo, sin hashes públicos", async () => {
  for (const name of ["admin", "despacho", "calidad", "conductor"]) {
    const login = await call("/api/v1/auth/login", "POST", { email: `${name}@demo.hormigestion.test`, password });
    assert.equal(login.status, 200);
    tokens[name] = login.data.accessToken;
    users[name] = login.data.usuario.id;
    assert.equal((await call("/api/v1/auth/me", "GET", undefined, tokens[name])).status, 200);
  }
  const list = await call("/api/v1/usuarios", "GET", undefined, tokens.admin);
  assert.equal(list.status, 200);
  assert.equal(JSON.stringify(list.data).includes("password"), false);
  assert.equal((await call("/api/v1/admin/configuracion", "GET", undefined, tokens.despacho)).status, 403);
  assert.equal((await call("/api/v1/usuarios", "GET", undefined, tokens.conductor)).status, 403);
});
test("JWT alterado, vencido y rol enviado en login no conceden acceso", async () => {
  const altered = `${tokens.admin!.slice(0, -8)}aaaaaaaa`;
  assert.equal((await call("/api/v1/auth/me", "GET", undefined, altered)).status, 401);
  const expired = jwt.sign({}, env.JWT_SECRET, { algorithm: "HS256", subject: users.admin, issuer: "hormigestion", audience: "hormigestion-api", expiresIn: -1 });
  assert.equal((await call("/api/v1/auth/me", "GET", undefined, expired)).status, 401);
  assert.equal((await call("/api/v1/auth/login", "POST", { email: "conductor@demo.hormigestion.test", password, rol: "ADMINISTRADOR" })).status, 400);
  assert.equal((await call("/api/v1/auth/login", "POST", { email: "no-existe@demo.hormigestion.test", password })).status, 401);
});
test("catálogos, OpenAPI y cálculo públicos devuelven versión y datos demo", async () => {
  const catalog = await call("/api/v1/catalogos");
  assert.equal(catalog.status, 200); assert.equal(catalog.data.resistencias.length, 5);
  assert.equal(catalog.data.datosDemostracion, true);
  assert.equal(catalog.data.mixers, undefined);
  configVersion = catalog.data.versionConfiguracion;
  const spec = await call("/api/v1/openapi.json");
  assert.equal(spec.status, 200); assert.equal(spec.data.openapi, "3.1.0");
  assert.ok(spec.data.paths["/api/v1/admin/configuracion"].put.requestBody);
  const { versionConfiguracion: _version, contacto: _contact, obra: _work, ...calculation } = creationInput();
  const result = await call("/api/v1/cotizaciones/calcular", "POST", calculation);
  assert.equal(result.status, 200); assert.equal(result.data.total, "530.27");
  assert.equal((await call("/api/v1/cotizaciones/calcular", "POST", { ...calculation, total: "0.01" })).status, 400);
});
test("solicitud guarda cliente, detalles, política y un evento persistente", async () => {
  originalRequest = creationInput(); originalKey = randomUUID();
  const result = await call("/api/v1/cotizaciones", "POST", originalRequest, undefined, { "Idempotency-Key": originalKey });
  assert.equal(result.status, 201); assert.equal(result.data.replayed, false);
  quoteId = result.data.cotizacion.id; quoteToken = result.data.tokenComprobante; quoteTotal = result.data.cotizacion.calculo.total;
  assert.equal(result.data.cotizacion.estado, "PENDIENTE");
  assert.equal(result.data.cotizacion.politicaEntrega.limiteEntregaMin, 90);
  assert.equal((await adminDb.query("SELECT count(*)::int AS n FROM eventos_salida WHERE recurso_id=$1 AND estado='PENDIENTE'", [quoteId])).rows[0].n, 1);
  assert.equal((await adminDb.query("SELECT count(*)::int AS n FROM detalles_cotizacion WHERE cotizacion_id=$1", [quoteId])).rows[0].n, 1);
});
test("reintentos concurrentes no duplican solicitud, cliente ni evento", async () => {
  const before = (await adminDb.query("SELECT count(*)::int AS n FROM clientes")).rows[0].n;
  const key = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => call("/api/v1/cotizaciones", "POST", creationInput(), undefined, { "Idempotency-Key": key })));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.equal(results.filter((result) => result.status === 200).length, 4);
  assert.equal(new Set(results.map((result) => result.data.cotizacion.id)).size, 1);
  assert.equal((await adminDb.query("SELECT count(*)::int AS n FROM clientes")).rows[0].n, before + 1);
  const different = { ...originalRequest, contacto: { ...originalRequest.contacto, nombre: "Otro cliente ficticio" } };
  assert.equal((await call("/api/v1/cotizaciones", "POST", different, undefined, { "Idempotency-Key": originalKey })).status, 409);
});
test("fallo del evento revierte toda la solicitud y permite reintentar", async () => {
  const query = "SELECT (SELECT count(*) FROM clientes)::int AS clientes,(SELECT count(*) FROM cotizaciones)::int AS cotizaciones,(SELECT count(*) FROM detalles_cotizacion)::int AS detalles,(SELECT count(*) FROM eventos_salida)::int AS eventos";
  const counts = (await adminDb.query(query)).rows[0];
  const key = randomUUID(); const input = creationInput();
  await adminDb.query("CREATE FUNCTION fallo_evento_prueba() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo de evento de prueba aislado'; END $$; CREATE TRIGGER fallo_evento BEFORE INSERT ON eventos_salida FOR EACH ROW EXECUTE FUNCTION fallo_evento_prueba()");
  try {
    assert.equal((await call("/api/v1/cotizaciones", "POST", input, undefined, { "Idempotency-Key": key })).status, 500);
    assert.deepEqual((await adminDb.query(query)).rows[0], counts);
  } finally { await adminDb.query("DROP TRIGGER fallo_evento ON eventos_salida; DROP FUNCTION fallo_evento_prueba()"); }
  assert.equal((await call("/api/v1/cotizaciones", "POST", input, undefined, { "Idempotency-Key": key })).status, 201);
});
test("comprobante y PDF exigen token propio o personal comercial autorizado", async () => {
  assert.equal((await call(`/api/v1/cotizaciones/${quoteId}/comprobante`)).status, 401);
  assert.equal((await call(`/api/v1/cotizaciones/${quoteId}/comprobante`, "GET", undefined, "token-incorrecto")).status, 401);
  assert.equal((await call(`/api/v1/cotizaciones/${quoteId}/comprobante`, "GET", undefined, tokens.conductor)).status, 403);
  const receipt = await call(`/api/v1/cotizaciones/${quoteId}/comprobante`, "GET", undefined, quoteToken);
  assert.equal(receipt.status, 200); assert.equal(receipt.data.calculo.total, quoteTotal);
  const pdf = await fetch(`${baseUrl}/api/v1/cotizaciones/${quoteId}/pdf`, { headers: { Authorization: `Bearer ${quoteToken}` } });
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get("content-type"), "application/pdf");
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  if (process.env.PDF_QA_OUTPUT) await writeFile(process.env.PDF_QA_OUTPUT, bytes);
  const other = await call("/api/v1/cotizaciones", "POST", creationInput(), undefined, { "Idempotency-Key": randomUUID() });
  assert.equal((await call(`/api/v1/cotizaciones/${other.data.cotizacion.id}/comprobante`, "GET", undefined, quoteToken)).status, 401);
});
test("configuración editable tiene historial; cotización antigua conserva precios", async () => {
  const current = await call("/api/v1/admin/configuracion", "GET", undefined, tokens.admin);
  config = current.data.configuracion;
  config.resistencias.find((item) => item.codigo === "FC-210")!.precioM3 = "90";
  config.mixers[0]!.capacidadM3 = "7";
  const update = await call("/api/v1/admin/configuracion", "PUT", { versionEsperada: configVersion, motivo: "Ajuste ficticio de tarifas y capacidad", configuracion: config }, tokens.admin);
  assert.equal(update.status, 200); configVersion = update.data.version;
  const old = await call(`/api/v1/cotizaciones/${quoteId}/comprobante`, "GET", undefined, quoteToken);
  assert.equal(old.data.calculo.total, "530.27");
  const retry = await call("/api/v1/cotizaciones", "POST", originalRequest, undefined, { "Idempotency-Key": originalKey });
  assert.equal(retry.status, 200); assert.equal(retry.data.tokenComprobante, quoteToken);
  assert.equal(retry.data.cotizacion.calculo.total, "530.27");
  assert.equal((await call("/api/v1/cotizaciones", "POST", originalRequest, undefined, { "Idempotency-Key": randomUUID() })).status, 409);
  const updated = await call("/api/v1/cotizaciones", "POST", creationInput(), undefined, { "Idempotency-Key": randomUUID() });
  assert.equal(updated.status, 201); assert.equal(updated.data.cotizacion.calculo.total, "603.41");
  const history = await call("/api/v1/admin/configuracion/historial", "GET", undefined, tokens.admin);
  assert.equal(history.data.data.length, 2);
  assert.equal((await adminDb.query("SELECT capacidad_m3 FROM camiones_mixer WHERE codigo='DEMO-MIXER-01'")).rows[0].capacidad_m3, "7.000");
});
test("actualizaciones concurrentes no sobrescriben una versión nueva", async () => {
  const body = { versionEsperada: configVersion, motivo: "Revisión concurrente ficticia", configuracion: config };
  const result = await Promise.all([call("/api/v1/admin/configuracion", "PUT", body, tokens.admin), call("/api/v1/admin/configuracion", "PUT", body, tokens.admin)]);
  assert.deepEqual(result.map((item) => item.status).sort(), [200, 409]);
  configVersion = result.find((item) => item.status === 200)!.data.version;
  const removed = structuredClone(config); removed.resistencias = removed.resistencias.filter((item) => item.codigo !== "FC-210");
  assert.equal((await call("/api/v1/admin/configuracion", "PUT", { versionEsperada: configVersion, motivo: "Intentar eliminar historial referenciado", configuracion: removed }, tokens.admin)).status, 422);
});
test("cambio fallido de configuración revierte versión, catálogos y auditoría", async () => {
  const counts = (await adminDb.query("SELECT (SELECT count(*) FROM configuracion_versiones)::int AS versiones,(SELECT count(*) FROM auditoria_eventos)::int AS eventos")).rows[0];
  await adminDb.query("CREATE FUNCTION fallo_catalogo_prueba() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo de prueba aislado'; END $$; CREATE TRIGGER fallo_catalogo BEFORE UPDATE ON resistencias FOR EACH ROW EXECUTE FUNCTION fallo_catalogo_prueba()");
  try {
    const result = await call("/api/v1/admin/configuracion", "PUT", { versionEsperada: configVersion, motivo: "Prueba de reversión atómica", configuracion: config }, tokens.admin);
    assert.equal(result.status, 500);
    assert.equal((await call("/api/v1/admin/configuracion", "GET", undefined, tokens.admin)).data.version, configVersion);
    assert.deepEqual((await adminDb.query("SELECT (SELECT count(*) FROM configuracion_versiones)::int AS versiones,(SELECT count(*) FROM auditoria_eventos)::int AS eventos")).rows[0], counts);
  } finally { await adminDb.query("DROP TRIGGER fallo_catalogo ON resistencias; DROP FUNCTION fallo_catalogo_prueba()"); }
});
test("transiciones comerciales son auditadas; no aprueba sin contacto previo", async () => {
  assert.equal((await call(`/api/v1/cotizaciones/${quoteId}/aprobar`, "POST", { versionEsperada: 1, motivo: "Aprobación anticipada de prueba" }, tokens.despacho)).status, 409);
  const contacted = await call(`/api/v1/cotizaciones/${quoteId}/contactar`, "POST", { versionEsperada: 1, motivo: "Contacto ficticio confirmado" }, tokens.despacho);
  assert.equal(contacted.status, 200); assert.equal(contacted.data.estado, "CONTACTADA");
  const approved = await call(`/api/v1/cotizaciones/${quoteId}/aprobar`, "POST", { versionEsperada: contacted.data.version, motivo: "Aceptación comercial ficticia" }, tokens.despacho);
  assert.equal(approved.status, 200); assert.equal(approved.data.estado, "APROBADA");
  assert.equal((await adminDb.query("SELECT count(*)::int AS n FROM auditoria_eventos WHERE recurso_id=$1 AND accion='COTIZACION_ESTADO'", [quoteId])).rows[0].n, 2);
});
test("personal desactivado pierde acceso aun conservando un JWT firmado", async () => {
  assert.equal((await call(`/api/v1/usuarios/${users.conductor}`, "PATCH", { activo: false }, tokens.admin)).status, 200);
  assert.equal((await call("/api/v1/auth/me", "GET", undefined, tokens.conductor)).status, 401);
  assert.equal((await call(`/api/v1/usuarios/${users.admin}`, "PATCH", { activo: false }, tokens.admin)).status, 409);
});
test("cuenta de aplicación no puede borrar ni modificar versiones históricas", async () => {
  await assert.rejects(appDb.query("DELETE FROM clientes"), (error: any) => error.code === "42501");
  await assert.rejects(appDb.query("UPDATE configuracion_versiones SET motivo='alterado'"), (error: any) => error.code === "42501");
  await assert.rejects(appDb.query("CREATE TABLE intrusion(id integer)"), (error: any) => error.code === "42501");
});
test("vigencia y token vencidos usan el reloj del servidor", async () => {
  const created = await call("/api/v1/cotizaciones", "POST", creationInput(), undefined, { "Idempotency-Key": randomUUID() });
  const id = created.data.cotizacion.id; const proof = created.data.tokenComprobante;
  const realNow = now;
  try {
    now = new Date(realNow.getTime() + 8 * 86400000);
    assert.equal((await call(`/api/v1/cotizaciones/${id}/comprobante`, "GET", undefined, proof)).data.estado, "VENCIDA");
    assert.equal((await call(`/api/v1/cotizaciones/${id}/contactar`, "POST", { versionEsperada: 1, motivo: "Contacto posterior al vencimiento" }, tokens.admin)).status, 409);
    now = new Date(realNow.getTime() + 31 * 86400000);
    assert.equal((await call(`/api/v1/cotizaciones/${id}/comprobante`, "GET", undefined, proof)).status, 401);
    assert.equal((await call(`/api/v1/cotizaciones/${id}/comprobante`, "GET", undefined, tokens.admin)).status, 200);
  } finally { now = realNow; }
});
test("CORS rechaza origen ajeno y JSON malformado devuelve error claro", async () => {
  assert.equal((await call("/api/v1/catalogos", "GET", undefined, undefined, { Origin: "https://ajeno.example.test" })).status, 403);
  const invalid = await fetch(`${baseUrl}/api/v1/cotizaciones/calcular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid" });
  assert.equal(invalid.status, 400); assert.equal((await invalid.json()).error.codigo, "CUERPO_INVALIDO");
});
test("login aplica límite de solicitudes en el servidor", async () => {
  const limited = createApp(appDb, env).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => limited.once("listening", resolve));
  const address = limited.address(); assert(address && typeof address !== "string");
  try {
    for (let index = 0; index < 10; index++) {
      const result = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      assert.equal(result.status, 400); await result.arrayBuffer();
    }
    const result = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(result.status, 429); assert.ok(result.headers.get("retry-after")); await result.arrayBuffer();
  } finally { await new Promise<void>((resolve) => limited.close(() => resolve())); }
});

test("reportería exige administrador, tanto JSON como CSV", async () => {
  for (const path of ["/api/v1/admin/reportes", "/api/v1/admin/reportes/exportar.csv"]) {
    assert.equal((await call(path)).status, 401);
    assert.equal((await call(path, "GET", undefined, tokens.despacho)).status, 403);
    assert.equal((await call(path, "GET", undefined, tokens.calidad)).status, 403);
  }
});
test("cabeceras y detalles se consolidan sin duplicar cotizaciones mixtas", async () => {
  const before = await call("/api/v1/admin/reportes", "GET", undefined, tokens.admin);
  assert.equal(before.status, 200);
  const input = creationInput();
  input.detalles.push({ ...input.detalles[0]!, resistenciaCodigo: "FC-240" });
  const created = await call("/api/v1/cotizaciones", "POST", input, undefined, { "Idempotency-Key": randomUUID() });
  assert.equal(created.status, 201);
  const after = await call("/api/v1/admin/reportes", "GET", undefined, tokens.admin);
  assert.equal(after.status, 200);
  assert.equal(after.data.indicadores.cotizaciones, before.data.indicadores.cotizaciones + 1);
  assert.equal(new Decimal(after.data.indicadores.volumenM3).minus(before.data.indicadores.volumenM3).toFixed(6), created.data.cotizacion.calculo.volumenTotalM3);
  assert.equal(new Decimal(after.data.indicadores.valorHormigon).minus(before.data.indicadores.valorHormigon).toFixed(2), created.data.cotizacion.calculo.subtotalHormigon);
  assert.equal(after.data.demanda.resistencias.reduce((sum: Decimal, row: any) => sum.plus(row.volumenM3), new Decimal(0)).toFixed(6), new Decimal(after.data.indicadores.volumenM3).toFixed(6));
  const filtered = await call("/api/v1/admin/reportes?resistencia=FC-240&zona=AMBATO-HUACHI", "GET", undefined, tokens.admin);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.data.indicadores.cotizaciones, 1);
  assert.equal(Number(filtered.data.indicadores.volumenM3), 5.3);
  assert.equal(filtered.data.demanda.zonas[0].codigo, "AMBATO-HUACHI");
});
test("orígenes reales y demo permanecen separados y agregados no exponen contactos", async () => {
  const created = await call("/api/v1/cotizaciones", "POST", creationInput(), undefined, { "Idempotency-Key": randomUUID() });
  // Fixture REAL únicamente en esta base temporal de pruebas.
  await adminDb.query("UPDATE cotizaciones SET datos_demostracion=false WHERE id=$1", [created.data.cotizacion.id]);
  const real = await call("/api/v1/admin/reportes?origen=REAL", "GET", undefined, tokens.admin);
  assert.equal(real.status, 200); assert.equal(real.data.indicadores.cotizaciones, 1); assert.equal(real.data.datosDemostracion, false);
  const demo = await call("/api/v1/admin/reportes?origen=DEMO", "GET", undefined, tokens.admin);
  assert.equal(demo.status, 200); assert.equal(demo.data.datosDemostracion, true);
  const text = JSON.stringify(demo.data);
  assert.equal(text.includes("telefono"), false); assert.equal(text.includes("email"), false); assert.equal(text.includes("tokenComprobante"), false);
  const empty = await call("/api/v1/admin/reportes?desde=2000-01-01&hasta=2000-01-07", "GET", undefined, tokens.admin);
  assert.equal(empty.status, 200); assert.equal(empty.data.indicadores.cotizaciones, 0); assert.equal(empty.data.demanda.diarios.length, 7);
});
test("reportería valida fechas, parámetros inesperados y códigos", async () => {
  for (const query of ["desde=2026-02-30", "desde=2026-10-03&hasta=2026-10-01", "desde=2024-01-01&hasta=2026-01-01", "origen=TODOS", "limit=1"]) assert.equal((await call(`/api/v1/admin/reportes?${query}`, "GET", undefined, tokens.admin)).status, 400);
  assert.equal((await call("/api/v1/admin/reportes?zona=NO-EXISTE", "GET", undefined, tokens.admin)).status, 422);
  assert.equal((await call("/api/v1/admin/reportes?resistencia=FC-999", "GET", undefined, tokens.admin)).status, 422);
});
test("historial sintético es idempotente, conserva datos y no emite notificaciones", async () => {
  const before = (await adminDb.query("SELECT count(*)::int AS n FROM eventos_salida")).rows[0].n;
  const oldQuote = (await call(`/api/v1/cotizaciones/${quoteId}/comprobante`, "GET", undefined, tokens.admin)).data;
  assert.equal(await seedReportDemo(adminDb, now), 198);
  assert.equal(await seedReportDemo(adminDb, new Date(now.getTime() + 86400000)), 0);
  assert.equal((await adminDb.query("SELECT count(*)::int AS n FROM eventos_salida")).rows[0].n, before);
  assert.equal((await call(`/api/v1/cotizaciones/${quoteId}/comprobante`, "GET", undefined, tokens.admin)).data.calculo.total, oldQuote.calculo.total);
});
test("proyección y pulso semanal usan semanas cerradas y totales reconciliados", async () => {
  const result = await call("/api/v1/admin/reportes", "GET", undefined, tokens.admin);
  assert.equal(result.status, 200);
  const projection = result.data.proyeccion;
  assert.equal(projection.estado, "DISPONIBLE"); assert.equal(projection.semanasHistoricas, 11); assert.equal(projection.semanas.length, 4);
  assert.ok(projection.historial.every((item: any) => item.desde < result.data.alertaSemanal.desde));
  const sum = projection.resistencias.reduce((value: Decimal, item: any) => value.plus(item.estimadoM3), new Decimal(0)).toFixed(3);
  assert.equal(projection.semanas[0].estimadoM3, sum);
  assert.equal(projection.zonas.reduce((value: Decimal, item: any) => value.plus(item.estimadoM3), new Decimal(0)).toFixed(3), sum);
  assert.ok(projection.resistencias.every((item: any) => item.evaluacion.semanasPrueba === 7 && Number.isFinite(Number(item.evaluacion.rmseM3))));
  assert.ok(result.data.alertaSemanal.avisos.some((item: any) => item.codigo === "DATOS_DEMO"));
});
test("CSV administrativo es un archivo filtrado, sin registros de contacto", async () => {
  const response = await fetch(`${baseUrl}/api/v1/admin/reportes/exportar.csv?resistencia=FC-210`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
  assert.equal(response.status, 200); assert.ok(response.headers.get("content-type")?.includes("text/csv"));
  const csv = await response.text(); assert.ok(csv.includes('"Resistencia";"FC-210"')); assert.equal(csv.includes('"Resistencia";"FC-350"'), false);
  assert.equal(csv.includes("0990000000"), false); assert.equal(csv.includes("historial@example.invalid"), false);
});
test("fecha local y vencimiento de cotizaciones coinciden con las reglas comerciales", async () => {
  const before = now;
  try {
    now = new Date("2026-10-05T04:59:59Z");
    const created = await call("/api/v1/cotizaciones", "POST", creationInput(), undefined, { "Idempotency-Key": randomUUID() });
    assert.equal(created.status, 201);
    assert.equal(localDate(now, "America/Guayaquil"), "2026-10-04");
    const sunday = await call("/api/v1/admin/reportes?desde=2026-10-04&hasta=2026-10-04", "GET", undefined, tokens.admin);
    assert.equal(sunday.status, 200); assert.equal(sunday.data.indicadores.cotizaciones, 1); assert.equal(sunday.data.alertaSemanal.desde, "2026-09-28");
    now = new Date("2026-10-05T05:00:00Z");
    const monday = await call("/api/v1/admin/reportes?desde=2026-10-05&hasta=2026-10-05", "GET", undefined, tokens.admin);
    assert.equal(monday.status, 200); assert.equal(monday.data.indicadores.cotizaciones, 0); assert.equal(monday.data.alertaSemanal.desde, "2026-10-05");
    now = new Date(created.data.cotizacion.validaHasta);
    const expired = await call("/api/v1/admin/reportes?desde=2026-10-04&hasta=2026-10-04", "GET", undefined, tokens.admin);
    assert.equal(expired.data.indicadores.vencidas, 1); assert.equal(expired.data.indicadores.pendientes, 0);
  } finally { now = before; }
});
