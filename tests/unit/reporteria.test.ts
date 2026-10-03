import assert from "node:assert/strict";
import { test } from "node:test";
import { Decimal } from "decimal.js";
import { addDays, allocateZones, csvCell, forecastSeries, localDate, monday, projection, reportFiltersSchema, type ReportFacts } from "../../src/domain/reporteria.js";

test("fechas y semanas se calculan según la zona de la planta", () => {
  assert.equal(localDate(new Date("2026-10-05T04:59:59Z"), "America/Guayaquil"), "2026-10-04");
  assert.equal(monday("2026-10-04"), "2026-09-28");
  assert.equal(monday("2026-10-05"), "2026-10-05");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
});
test("filtros rechazan fechas imposibles, rango invertido, rango excesivo y códigos arbitrarios", () => {
  for (const query of [{ desde: "2026-02-30" }, { desde: "2026-10-03", hasta: "2026-10-01" }, { desde: "2025-01-01", hasta: "2026-10-01" }, { origen: "TODOS" }, { zona: "' OR 1=1 --" }, { limit: 100 }]) assert.equal(reportFiltersSchema.safeParse(query).success, false);
  assert.equal(reportFiltersSchema.safeParse({ desde: "2026-01-01", hasta: "2026-12-31", origen: "REAL" }).success, true);
});
test("proyección insuficiente no devuelve cifras y cuatro semanas no inventan precisión", () => {
  assert.equal(forecastSeries([10, 20, 30]), null);
  const result = forecastSeries([10, 20, 30, 40])!;
  assert.equal(result.estimadoM3, "25.000");
  assert.equal(result.modelo, "MEDIA_4");
  assert.deepEqual(result.evaluacion, { semanasPrueba: 0, maeM3: null, rmseM3: null, wapePct: null });
});
test("validación temporal cuenta únicamente semanas fuera del entrenamiento", () => {
  const result = forecastSeries([10, 10, 10, 10, 10, 10, 10, 10])!;
  assert.equal(result.estimadoM3, "10.000");
  assert.equal(result.evaluacion.semanasPrueba, 4);
  assert.equal(result.evaluacion.rmseM3, "0.000");
  assert.equal(result.evaluacion.wapePct, "0.00");
  const increasing = forecastSeries([10, 20, 30, 40, 50, 60, 70, 80])!;
  assert.equal(increasing.modelo, "INGENUO");
  assert.equal(increasing.estimadoM3, "80.000");
  assert.equal(increasing.evaluacion.maeM3, "10.000");
});
test("series de ceros no producen división por cero ni confianza ficticia", () => {
  const result = forecastSeries(Array.from({ length: 10 }, () => 0))!;
  assert.equal(result.estimadoM3, "0.000");
  assert.equal(result.evaluacion.wapePct, null);
  assert.equal(result.evaluacion.maeM3, "0.000");
});
test("proyección excluye primera semana y semana en curso; suma coherente por resistencias", () => {
  const weeks = Array.from({ length: 7 }, (_, i) => ({ desde: addDays("2026-08-24", i * 7), volumenM3: "30", cotizaciones: 2 }));
  const facts = { primeraCotizacion: "2026-08-25", semanas: weeks, semanasResistencia: weeks.flatMap((week) => [{ ...week, codigo: "FC-210", fcKgfCm2: 210, volumenM3: "10" }, { ...week, codigo: "FC-240", fcKgfCm2: 240, volumenM3: "20" }]), zonasRecientes: [] } as unknown as ReportFacts;
  const result = projection(facts, "2026-10-05", []);
  assert.equal(result.semanasHistoricas, 5);
  assert.equal(result.historial[0]!.desde, "2026-08-31");
  assert.equal(result.historial.at(-1)!.desde, "2026-09-28");
  assert.equal(result.semanas[0]!.desde, "2026-10-12");
  assert.equal(result.semanas[0]!.estimadoM3, "30.000");
});
test("asignación por zonas conserva exactamente el volumen tras redondear", () => {
  const zones = ["A", "B", "C"].map((codigo) => ({ codigo, nombre: codigo, cotizaciones: 1, volumenM3: "1", valorHormigon: "1" }));
  const result = allocateZones("10.000", zones);
  assert.equal(result.reduce((sum, row) => sum.plus(row.estimadoM3), new Decimal(0)).toFixed(3), "10.000");
  assert.equal(result[0]!.estimadoM3, "3.334");
  assert.deepEqual(allocateZones("1.000", []), []);
});
test("CSV escapa comillas y neutraliza fórmulas incluidas en nombres de zona", () => {
  assert.equal(csvCell('Zona "Norte"'), '"Zona ""Norte"""');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell(" @SUM(A1)"), '"\' @SUM(A1)"');
  assert.equal(csvCell("12.300"), '"12.300"');
});
