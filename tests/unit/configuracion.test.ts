import assert from "node:assert/strict";
import { test } from "node:test";
import { configurationSchema } from "../../src/domain/configuracion.js";
import { demoConfiguration } from "../../src/domain/demo.js";
import { loadEnv } from "../../src/infrastructure/env.js";

test("datos demo incluyen cinco resistencias, flota plausible y normativa sin verificar", () => {
  const config = configurationSchema.parse(demoConfiguration);
  assert.deepEqual(config.resistencias.map((item) => item.fcKgfCm2), [180, 210, 240, 280, 350]);
  assert.equal(config.datosDemostracion, true);
  assert.equal(config.calidad.referenciaVerificada, false);
  assert.deepEqual(config.calidad.edadesEnsayoDias, [7, 28]);
});
test("configuración rechaza umbrales invertidos, placas duplicadas y rangos inválidos", () => {
  const thresholds = structuredClone(demoConfiguration); thresholds.calidad.avisoMin = 90;
  assert.equal(configurationSchema.safeParse(thresholds).success, false);
  const plates = structuredClone(demoConfiguration); plates.mixers[1]!.placa = plates.mixers[0]!.placa.toLowerCase();
  assert.equal(configurationSchema.safeParse(plates).success, false);
  const waste = structuredClone(demoConfiguration); waste.comercial.desperdicioMaxPct = "4";
  assert.equal(configurationSchema.safeParse(waste).success, false);
});
test("precios no pierden precisión al persistirse en NUMERIC(...,2)", () => {
  const config = structuredClone(demoConfiguration); config.resistencias[0]!.precioM3 = "72.123";
  assert.equal(configurationSchema.safeParse(config).success, false);
});
test("configuración rechaza campos desconocidos y claves de catálogo duplicadas", () => {
  assert.equal(configurationSchema.safeParse({ ...demoConfiguration, jwtSecret: "incorrecto" }).success, false);
  const config = structuredClone(demoConfiguration); config.resistencias.push({ ...config.resistencias[0]! });
  assert.equal(configurationSchema.safeParse(config).success, false);
});
test("entorno requiere secretos independientes y restringe demo en producción", () => {
  const source = { DATABASE_URL: "postgresql://test:test@localhost/test", JWT_SECRET: "a".repeat(40), COMPROBANTE_SECRET: "b".repeat(40), NODE_ENV: "test" };
  assert.equal(loadEnv(source).DEMO_MODE, false);
  assert.throws(() => loadEnv({ ...source, JWT_SECRET: "corto" }));
  assert.throws(() => loadEnv({ ...source, COMPROBANTE_SECRET: source.JWT_SECRET }));
  assert.throws(() => loadEnv({ ...source, NODE_ENV: "production", DEMO_MODE: "true", CORS_ORIGINS: "https://demo.example.test" }));
});
