import { Decimal } from "decimal.js";
import { z } from "zod";

export const reportFiltersSchema = z.strictObject({
  desde: z.iso.date().optional(), hasta: z.iso.date().optional(),
  origen: z.enum(["DEMO", "REAL"]).optional(),
  resistencia: z.string().regex(/^[A-Z][A-Z0-9_-]{1,39}$/).optional(),
  zona: z.string().regex(/^[A-Z][A-Z0-9_-]{1,39}$/).optional(),
}).superRefine((value, ctx) => {
  if (value.desde && value.hasta) {
    const days = (Date.parse(value.hasta) - Date.parse(value.desde)) / 86400000;
    if (days < 0 || days > 365) ctx.addIssue({ code: "custom", path: ["hasta"], message: "Seleccione un período ordenado de hasta 366 días" });
  }
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type Summary = { cotizaciones: number; volumenM3: string; valorHormigon: string; aprobadas: number; pendientes: number; contactadas: number; rechazadas: number; vencidas: number };
export type DemandGroup = { codigo: string; nombre: string; cotizaciones: number; volumenM3: string; valorHormigon: string };
export type Week = { desde: string; volumenM3: string; cotizaciones: number };
export type WeeklyResistance = Week & { codigo: string; fcKgfCm2: number };
export type ReportFacts = {
  actual: Summary; anterior: Summary; resistencias: DemandGroup[]; zonas: DemandGroup[];
  diarios: { fecha: string; cotizaciones: number; volumenM3: string }[];
  semanas: Week[]; semanasResistencia: WeeklyResistance[]; zonasRecientes: DemandGroup[];
  primeraCotizacion: string | null;
};
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function monday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return addDays(date, 1 - day);
}

// Modelos de nivel: no extrapolan una tendencia o estacionalidad inexistente.
type Candidate = { codigo: string; nombre: string; predict: (values: number[]) => number };
const candidates: Candidate[] = [
  { codigo: "INGENUO", nombre: "Última semana", predict: (values) => values.at(-1) ?? 0 },
  { codigo: "MEDIA_4", nombre: "Media móvil de 4 semanas", predict: (values) => values.slice(-4).reduce((sum, value) => sum + value, 0) / Math.min(4, values.length) },
  ...[0.2, 0.4, 0.6, 0.8].map((alpha) => ({
    codigo: `SES_${alpha}`, nombre: `Suavizamiento exponencial (α=${alpha})`,
    predict: (values: number[]) => values.slice(1).reduce((level, value) => alpha * value + (1 - alpha) * level, values[0] ?? 0),
  })),
];
export function forecastSeries(values: number[]) {
  if (values.length < 4) return null;
  const evaluations = candidates.map((model) => {
    const errors = values.slice(4).map((actual, offset) => actual - model.predict(values.slice(0, offset + 4)));
    return { model, errors, rmse: errors.length ? Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length) : null };
  });
  // Sin semanas de prueba se usa la media de cuatro semanas y se informa error desconocido.
  const selected = values.length === 4 ? evaluations[1]! : evaluations.reduce((best, item) => item.rmse! < best.rmse! ? item : best);
  const actualTotal = values.slice(4).reduce((sum, value) => sum + value, 0);
  const absoluteError = selected.errors.reduce((sum, error) => sum + Math.abs(error), 0);
  return {
    modelo: selected.model.codigo, nombreModelo: selected.model.nombre,
    estimadoM3: new Decimal(Math.max(0, selected.model.predict(values))).toFixed(3),
    evaluacion: {
      semanasPrueba: selected.errors.length,
      maeM3: selected.errors.length ? new Decimal(absoluteError / selected.errors.length).toFixed(3) : null,
      rmseM3: selected.rmse === null ? null : new Decimal(selected.rmse).toFixed(3),
      wapePct: actualTotal > 0 ? new Decimal(absoluteError).div(actualTotal).mul(100).toFixed(2) : null,
    },
  };
}

export function allocateZones(total: string, zones: DemandGroup[]) {
  const sum = zones.reduce((value, zone) => value.plus(zone.volumenM3), new Decimal(0));
  if (sum.isZero()) return [];
  const sorted = zones.toSorted((a, b) => new Decimal(b.volumenM3).cmp(a.volumenM3));
  const allocated = sorted.map((zone) => ({ codigo: zone.codigo, nombre: zone.nombre,
    participacionPct: new Decimal(zone.volumenM3).div(sum).mul(100).toFixed(2),
    estimadoM3: new Decimal(total).mul(zone.volumenM3).div(sum).toFixed(3),
  }));
  const remainder = new Decimal(total).minus(allocated.reduce((value, zone) => value.plus(zone.estimadoM3), new Decimal(0)));
  allocated[0]!.estimadoM3 = new Decimal(allocated[0]!.estimadoM3).plus(remainder).toFixed(3);
  return allocated;
}

export function projection(facts: ReportFacts, currentWeek: string, activeResistances: { codigo: string; fcKgfCm2: number }[]) {
  // La primera semana observada puede ser incompleta: se excluye por prudencia.
  const coverage = facts.primeraCotizacion ? addDays(monday(facts.primeraCotizacion), 7) : currentWeek;
  const complete = facts.semanas.filter((week) => week.desde >= coverage && week.desde < currentWeek);
  const codes = new Map(activeResistances.map((item) => [item.codigo, item.fcKgfCm2]));
  for (const row of facts.semanasResistencia) codes.set(row.codigo, row.fcKgfCm2);
  const byResistance = [...codes].map(([codigo, fcKgfCm2]) => {
    const series = complete.map((week) => facts.semanasResistencia.filter((row) => row.codigo === codigo && row.desde === week.desde).reduce((sum, row) => sum + Number(row.volumenM3), 0));
    return { codigo, fcKgfCm2, ...forecastSeries(series) };
  }).filter((row): row is typeof row & NonNullable<ReturnType<typeof forecastSeries>> => row.estimadoM3 !== undefined);
  const sufficient = complete.length >= 4;
  const total = sufficient ? byResistance.reduce((sum, row) => sum.plus(row.estimadoM3), new Decimal(0)).toFixed(3) : null;
  return {
    estado: sufficient ? "DISPONIBLE" as const : "HISTORIAL_INSUFICIENTE" as const,
    objetivo: "VOLUMEN_COTIZADO" as const, semanasMinimas: 4, semanasHistoricas: complete.length,
    coberturaDesde: complete[0]?.desde ?? null, historial: complete,
    resistencias: byResistance.toSorted((a, b) => new Decimal(b.estimadoM3).cmp(a.estimadoM3)),
    semanas: Array.from({ length: 4 }, (_, index) => ({ desde: addDays(currentWeek, (index + 1) * 7), hasta: addDays(currentWeek, (index + 1) * 7 + 6), estimadoM3: total })),
    zonas: total ? allocateZones(total, facts.zonasRecientes) : [],
  };
}

export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
