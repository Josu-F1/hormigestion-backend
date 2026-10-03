import type { Pool } from "pg";
import { addDays, localDate, monday, reportFiltersSchema, type ReportFacts, type ReportFilters } from "../../domain/reporteria.js";
import { AppError } from "../../domain/errors.js";
import { currentConfiguration } from "./store.js";
import { transaction } from "./pool.js";

const aggregate = `
WITH parameters AS (
  SELECT $1::date AS desde, $2::date AS hasta, $3::timestamptz AS ahora,
    $4::text AS tz, $5::boolean AS demo, $6::text AS resistencia, $7::text AS zona,
    $8::date AS semana, ($2::date - $1::date + 1) AS dias
), quotes AS MATERIALIZED (
  SELECT q.id, q.zona_codigo,
    q.snapshot->'calculo'->'zona'->>'canton' AS canton,
    q.snapshot->'calculo'->'zona'->>'sector' AS sector,
    (q.creado_en AT TIME ZONE p.tz)::date AS fecha,
    CASE WHEN q.estado IN ('PENDIENTE','CONTACTADA') AND q.valida_hasta <= p.ahora THEN 'VENCIDA' ELSE q.estado END AS estado
  FROM cotizaciones q CROSS JOIN parameters p
  WHERE q.datos_demostracion = p.demo AND (p.zona IS NULL OR q.zona_codigo = p.zona)
    AND q.creado_en >= (LEAST(p.desde - p.dias, p.semana - 182)::timestamp AT TIME ZONE p.tz)
    AND q.creado_en < ((GREATEST(p.hasta, (p.ahora AT TIME ZONE p.tz)::date) + 1)::timestamp AT TIME ZONE p.tz)
    AND q.creado_en <= p.ahora
), lines AS MATERIALIZED (
  SELECT d.cotizacion_id, d.resistencia_codigo, (d.snapshot->>'fcKgfCm2')::integer AS fc,
    d.volumen_total_m3 AS volumen, d.subtotal_hormigon AS valor
  FROM detalles_cotizacion d JOIN quotes q ON q.id=d.cotizacion_id CROSS JOIN parameters p
  WHERE p.resistencia IS NULL OR d.resistencia_codigo=p.resistencia
), base AS MATERIALIZED (
  SELECT q.*, totals.volumen, totals.valor FROM quotes q JOIN (
    SELECT cotizacion_id, SUM(volumen) AS volumen, SUM(valor) AS valor FROM lines GROUP BY cotizacion_id
  ) totals ON totals.cotizacion_id=q.id
), selected AS MATERIALIZED (
  SELECT b.* FROM base b CROSS JOIN parameters p WHERE b.fecha BETWEEN p.desde AND p.hasta
), summary AS (
  SELECT period,
    jsonb_build_object('cotizaciones',COUNT(b.id)::int,'volumenM3',COALESCE(SUM(b.volumen),0)::text,
      'valorHormigon',COALESCE(SUM(b.valor),0)::text,
      'aprobadas',COUNT(b.id) FILTER (WHERE b.estado='APROBADA')::int,
      'pendientes',COUNT(b.id) FILTER (WHERE b.estado='PENDIENTE')::int,
      'contactadas',COUNT(b.id) FILTER (WHERE b.estado='CONTACTADA')::int,
      'rechazadas',COUNT(b.id) FILTER (WHERE b.estado='RECHAZADA')::int,
      'vencidas',COUNT(b.id) FILTER (WHERE b.estado='VENCIDA')::int) AS data
  FROM parameters p CROSS JOIN (VALUES ('actual'),('anterior')) AS periods(period)
  LEFT JOIN base b ON CASE WHEN period='actual' THEN b.fecha BETWEEN p.desde AND p.hasta ELSE b.fecha >= p.desde-p.dias AND b.fecha < p.desde END
  GROUP BY period
), resistance AS (
  SELECT l.resistencia_codigo AS codigo, 'f’c '||l.fc||' kgf/cm²' AS nombre,
    COUNT(DISTINCT s.id)::int AS cotizaciones, SUM(l.volumen)::text AS "volumenM3", SUM(l.valor)::text AS "valorHormigon"
  FROM selected s JOIN lines l ON l.cotizacion_id=s.id GROUP BY l.resistencia_codigo,l.fc
), zones AS (
  SELECT zona_codigo AS codigo, MAX(canton||' · '||sector) AS nombre,
    COUNT(*)::int AS cotizaciones, SUM(volumen)::text AS "volumenM3",SUM(valor)::text AS "valorHormigon"
  FROM selected GROUP BY zona_codigo
), daily AS (
  SELECT day::date::text AS fecha, COUNT(s.id)::int AS cotizaciones,COALESCE(SUM(s.volumen),0)::text AS "volumenM3"
  FROM parameters p CROSS JOIN LATERAL generate_series(p.desde::timestamp,p.hasta::timestamp,'1 day') day
  LEFT JOIN selected s ON s.fecha=day::date GROUP BY day
), weeks AS (
  SELECT day::date AS desde,COUNT(b.id)::int AS cotizaciones,COALESCE(SUM(b.volumen),0)::text AS "volumenM3"
  FROM parameters p CROSS JOIN LATERAL generate_series((p.semana-182)::timestamp,(p.semana-7)::timestamp,'7 days') day
  LEFT JOIN base b ON b.fecha>=day::date AND b.fecha<day::date+7 GROUP BY day
), weekly_resistance AS (
  SELECT date_trunc('week',b.fecha)::date::text AS desde,l.resistencia_codigo AS codigo,MAX(l.fc) AS "fcKgfCm2",
    COUNT(DISTINCT b.id)::int AS cotizaciones,SUM(l.volumen)::text AS "volumenM3"
  FROM base b JOIN lines l ON l.cotizacion_id=b.id CROSS JOIN parameters p
  WHERE b.fecha >= p.semana-182 AND b.fecha<p.semana GROUP BY date_trunc('week',b.fecha),l.resistencia_codigo
), recent_zones AS (
  SELECT b.zona_codigo AS codigo,MAX(b.canton||' · '||b.sector) AS nombre,
    COUNT(*)::int AS cotizaciones,SUM(b.volumen)::text AS "volumenM3",SUM(b.valor)::text AS "valorHormigon"
  FROM base b CROSS JOIN parameters p WHERE b.fecha>=p.semana-28 AND b.fecha<p.semana GROUP BY b.zona_codigo
), first_quote AS (
  SELECT MIN(q.creado_en AT TIME ZONE p.tz)::date::text AS fecha
  FROM cotizaciones q CROSS JOIN parameters p
  WHERE q.datos_demostracion=p.demo AND q.creado_en<=p.ahora AND (p.zona IS NULL OR q.zona_codigo=p.zona)
    AND EXISTS (SELECT 1 FROM detalles_cotizacion d WHERE d.cotizacion_id=q.id AND (p.resistencia IS NULL OR d.resistencia_codigo=p.resistencia))
)
SELECT jsonb_build_object(
  'actual',(SELECT data FROM summary WHERE period='actual'), 'anterior',(SELECT data FROM summary WHERE period='anterior'),
  'resistencias',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."volumenM3"::numeric DESC,r.codigo) FROM resistance r),'[]'),
  'zonas',COALESCE((SELECT jsonb_agg(to_jsonb(z) ORDER BY z."volumenM3"::numeric DESC,z.codigo) FROM zones z),'[]'),
  'diarios',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.fecha) FROM daily d),'[]'),
  'semanas',COALESCE((SELECT jsonb_agg(jsonb_build_object('desde',w.desde::text,'cotizaciones',w.cotizaciones,'volumenM3',w."volumenM3") ORDER BY w.desde) FROM weeks w),'[]'),
  'semanasResistencia',COALESCE((SELECT jsonb_agg(to_jsonb(w) ORDER BY w.desde,w.codigo) FROM weekly_resistance w),'[]'),
  'zonasRecientes',COALESCE((SELECT jsonb_agg(to_jsonb(z) ORDER BY z."volumenM3"::numeric DESC,z.codigo) FROM recent_zones z),'[]'),
  'primeraCotizacion',(SELECT fecha FROM first_quote)
) AS facts`;

export class PgReportStore {
  constructor(private readonly pool: Pool) {}
  async read(input: ReportFilters, now: Date) {
    return transaction(this.pool, async (client) => {
      const configuration = await currentConfiguration(client);
      const tz = configuration.configuracion.planta.zonaHoraria;
      const today = localDate(now, tz);
      const filters = reportFiltersSchema.parse({ ...input, desde: input.desde ?? addDays(input.hasta ?? today, -27), hasta: input.hasta ?? today,
        origen: input.origen ?? (configuration.configuracion.datosDemostracion ? "DEMO" : "REAL") });
      if (filters.resistencia && !configuration.configuracion.resistencias.some((item) => item.codigo === filters.resistencia)) throw new AppError(422, "RESISTENCIA_DESCONOCIDA", "Seleccione una resistencia del catálogo");
      if (filters.zona && !configuration.configuracion.zonasFlete.some((item) => item.codigo === filters.zona)) throw new AppError(422, "ZONA_DESCONOCIDA", "Seleccione una zona del catálogo");
      const week = monday(today);
      const result = await client.query<{ facts: ReportFacts }>(aggregate, [filters.desde, filters.hasta, now, tz, filters.origen === "DEMO", filters.resistencia ?? null, filters.zona ?? null, week]);
      return { facts: result.rows[0]!.facts, filters, configuration, today, week };
    }, "REPEATABLE READ");
  }
}
