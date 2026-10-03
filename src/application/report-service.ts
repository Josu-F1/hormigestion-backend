import { Decimal } from "decimal.js";
import type { Actor } from "../domain/configuracion.js";
import { addDays, csvCell, projection, type ReportFilters } from "../domain/reporteria.js";
import type { PgReportStore } from "../infrastructure/database/report-store.js";
import { requireRole } from "./services.js";

const displayNumber = (value: string, decimals = 2) => new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimals }).format(Number(value));

export class ReportService {
  constructor(private readonly store: Pick<PgReportStore, "read">, private readonly clock: () => Date = () => new Date()) {}
  async report(input: ReportFilters, actor: Actor) {
    requireRole(actor, ["ADMINISTRADOR"]);
    const now = this.clock();
    const { facts, filters, configuration, today, week } = await this.store.read(input, now);
    const config = configuration.configuracion;
    const forecast = projection(facts, week, config.resistencias.filter((item) => item.activo));
    const last = facts.semanas.at(-1)!;
    const previous = facts.semanas.at(-2)!;
    const variation = new Decimal(previous.volumenM3).gt(0) ? new Decimal(last.volumenM3).minus(previous.volumenM3).div(previous.volumenM3).mul(100).toFixed(2) : null;
    const alerts: { codigo: string; nivel: "INFORMACION" | "ATENCION"; titulo: string; mensaje: string }[] = [];
    if (filters.origen === "DEMO") alerts.push({ codigo: "DATOS_DEMO", nivel: "INFORMACION", titulo: "Historial de demostración", mensaje: "Este análisis utiliza cotizaciones ficticias. No representa resultados de la empresa." });
    if (forecast.estado === "HISTORIAL_INSUFICIENTE") alerts.push({ codigo: "HISTORIAL_INSUFICIENTE", nivel: "ATENCION", titulo: "Hace falta más historial", mensaje: `Hay ${forecast.semanasHistoricas} semanas completas observadas; se necesitan al menos 4 para estimar demanda.` });
    if (variation && new Decimal(variation).abs().gte(20)) alerts.push({ codigo: "CAMBIO_DEMANDA", nivel: "ATENCION", titulo: new Decimal(variation).gt(0) ? "Aumento de solicitudes" : "Descenso de solicitudes", mensaje: `El volumen cotizado de la última semana cerrada varió ${displayNumber(variation)}% respecto a la anterior. Revisa el contexto comercial antes de ajustar recursos.` });
    const hours = (time: string) => { const [h, m] = time.split(":").map(Number); return h! + m! / 60; };
    const weeklyCapacity = new Decimal(config.planta.capacidadProduccionM3Hora).mul(hours(config.planta.cierre) - hours(config.planta.apertura)).mul(config.planta.diasLaborables.length);
    const total = forecast.semanas[0]?.estimadoM3;
    if (total && new Decimal(total).gt(weeklyCapacity.mul(0.8))) alerts.push({ codigo: "REVISAR_CAPACIDAD", nivel: "ATENCION", titulo: "Revisar capacidad nominal", mensaje: "La demanda cotizada estimada supera el 80% de la capacidad teórica semanal configurada. Verifica pedidos confirmados y disponibilidad real." });
    if (!alerts.some((item) => item.nivel === "ATENCION")) alerts.push({ codigo: "SIN_CAMBIOS_RELEVANTES", nivel: "INFORMACION", titulo: "Sin cambios semanales superiores al umbral", mensaje: "No se detectaron variaciones de volumen de al menos 20% entre las dos últimas semanas cerradas. Esto no garantiza estabilidad futura." });
    const leader = forecast.resistencias[0];
    const zone = forecast.zonas[0];
    const recommendations = [
      ...(leader && Number(leader.estimadoM3) > 0 ? [{ titulo: `Priorizar consultas de ${leader.codigo}`, mensaje: `Es la resistencia con mayor volumen semanal estimado (${displayNumber(leader.estimadoM3, 3)} m³). Revisa las solicitudes con el equipo comercial.` }] : []),
      ...(zone ? [{ titulo: `Coordinar entregas en ${zone.nombre}`, mensaje: `Concentra el ${displayNumber(zone.participacionPct)}% del volumen cotizado de las últimas cuatro semanas cerradas. Evalúa rutas cuando se confirmen los pedidos.` }] : []),
      { titulo: "Programar con pedidos confirmados", mensaje: "Las cotizaciones y fechas preferidas no reservan mixers. Confirma volumen, acceso, fecha y turno antes de producir hormigón fresco o asignar vehículos." },
    ];
    const span = (Date.parse(filters.hasta!) - Date.parse(filters.desde!)) / 86400000 + 1;
    return {
      generadoEn: now.toISOString(), fechaLocal: today, zonaHoraria: config.planta.zonaHoraria,
      versionConfiguracion: configuration.version, datosDemostracion: filters.origen === "DEMO", filtros: filters,
      periodoAnterior: { desde: addDays(filters.desde!, -span), hasta: addDays(filters.desde!, -1) },
      opciones: {
        resistencias: config.resistencias.map(({ codigo, fcKgfCm2, activo }) => ({ codigo, fcKgfCm2, activo })),
        zonas: config.zonasFlete.map(({ codigo, canton, sector, activo }) => ({ codigo, canton, sector, activo })),
      },
      indicadores: facts.actual, indicadoresAnteriores: facts.anterior,
      demanda: { resistencias: facts.resistencias, zonas: facts.zonas, diarios: facts.diarios },
      proyeccion: forecast,
      planificacion: {
        diasLaborables: config.planta.diasLaborables.length, capacidadNominalSemanalM3: weeklyCapacity.toFixed(3),
        capacidadReferenciaViajeM3: config.logistica.capacidadReferenciaViajeM3,
        mixersDisponibles: config.mixers.filter((item) => item.estado === "DISPONIBLE").length,
        volumenDiarioOrientativoM3: total ? new Decimal(total).div(config.planta.diasLaborables.length).toFixed(3) : null,
        viajesReferenciaSemana: total ? new Decimal(total).div(config.logistica.capacidadReferenciaViajeM3).ceil().toNumber() : null,
      },
      alertaSemanal: { id: `PULSO-${week}-${filters.origen}-${filters.resistencia ?? "TODAS"}-${filters.zona ?? "TODAS"}`,
        desde: week, hasta: addDays(week, 6), semanaAnalizada: { desde: last.desde, hasta: addDays(last.desde, 6) },
        variacionVolumenPct: variation, volumenUltimaSemanaM3: last.volumenM3, volumenSemanaAnteriorM3: previous.volumenM3, avisos: alerts },
      recomendaciones: recommendations,
      metodologia: {
        demanda: "Volumen total cotizado, incluido desperdicio y redondeo comercial. Incluye todos los estados; no representa despacho, venta ni producción.",
        valor: "Suma de subtotales de hormigón de los detalles filtrados, sin impuesto, flete ni bombeo. No es facturación.",
        proyeccion: "Modelos de nivel (última semana, media móvil de 4 semanas y suavizamiento exponencial). Selección automática por menor RMSE en validación temporal; cada prueba solo usa semanas anteriores. Horizonte de 4 semanas, sin tendencia ni estacionalidad asumidas.",
        cobertura: "Hasta 26 semanas cerradas; se excluyen la semana en curso y la primera semana observada. Las semanas posteriores sin cotizaciones cuentan como cero. Los filtros de resistencia, zona y origen afectan el pronóstico; el rango de fechas solo afecta la reportería.",
        zonas: "Distribución proporcional al volumen de las últimas 4 semanas cerradas; no es un modelo independiente por zona.",
        alerta: "Pulso calculado para la semana local actual al consultar el panel. Umbrales orientativos: variación de 20% y utilización de 80% de capacidad nominal. No envía notificaciones externas.",
        limitacion: "No incluye despachos ni franjas horarias, aún sin integrar. El error histórico mide cotizaciones; no es una garantía ni una precisión contra despacho real.",
      },
    };
  }

  async csv(input: ReportFilters, actor: Actor) {
    const report = await this.report(input, actor);
    const rows: (string | number)[][] = [
      ["HormiGestión · Reporte de cotizaciones", report.filtros.origen!, "Desde", report.filtros.desde!, "Hasta", report.filtros.hasta!],
      ["Generado", report.generadoEn, "Zona horaria", report.zonaHoraria],
      ["Alcance", report.metodologia.demanda], ["Valor", report.metodologia.valor],
      ["Sección", "Código", "Nombre / estado", "Cotizaciones", "Volumen (m³)", "Hormigón sin servicios / impuesto (USD)"],
      ["Resumen", "TOTAL", "Todos los estados", report.indicadores.cotizaciones, report.indicadores.volumenM3, report.indicadores.valorHormigon],
      ...report.demanda.resistencias.map((item) => ["Resistencia", item.codigo, item.nombre, item.cotizaciones, item.volumenM3, item.valorHormigon]),
      ...report.demanda.zonas.map((item) => ["Zona", item.codigo, item.nombre, item.cotizaciones, item.volumenM3, item.valorHormigon]),
      ["Fecha", "Cotizaciones", "Volumen (m³)"],
      ...report.demanda.diarios.map((item) => [item.fecha, item.cotizaciones, item.volumenM3]),
    ];
    return { filename: `cotizaciones-${report.filtros.desde}-${report.filtros.hasta}-${report.filtros.origen}.csv`, content: `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n` };
  }
}
