import { Decimal } from "decimal.js";
import { z } from "zod";
import type { Configuration } from "./configuracion.js";
import { decimal } from "./configuracion.js";
import { AppError } from "./errors.js";

const measurementSchema = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("PRISMA"), largoM: decimal(0.001, 1000), anchoM: decimal(0.001, 1000), altoM: decimal(0.001, 1000) }),
  z.strictObject({ tipo: z.literal("CILINDRO"), diametroM: decimal(0.001, 100), altoM: decimal(0.001, 1000) }),
  z.strictObject({ tipo: z.literal("VOLUMEN_DIRECTO"), volumenM3: decimal(0.001, 10000) }),
]);
export const calculationSchema = z.strictObject({
  zonaCodigo: z.string().min(2).max(40), requiereBombeo: z.boolean().default(false),
  detalles: z.array(z.strictObject({
    elementoCodigo: z.string().min(2).max(40), resistenciaCodigo: z.string().min(2).max(40),
    cantidad: z.int().min(1).max(10000).default(1), desperdicioPct: decimal(0, 30, 3).optional(), medicion: measurementSchema,
  })).min(1).max(25),
});
export const createQuotationSchema = calculationSchema.extend({
  versionConfiguracion: z.int().positive(),
  contacto: z.strictObject({
    nombre: z.string().trim().min(3).max(120),
    telefono: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/),
    email: z.email().max(254).optional(),
  }),
  obra: z.strictObject({ direccion: z.string().trim().min(10).max(500), fechaPreferida: z.iso.date() }),
});
export type CalculationInput = z.infer<typeof calculationSchema>;
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

const money = (value: Decimal) => value.toFixed(2, Decimal.ROUND_HALF_UP);
const volume = (value: Decimal) => value.toFixed(6, Decimal.ROUND_HALF_UP);

export function calculateQuotation(input: CalculationInput, config: Configuration, version: number) {
  const zone = config.zonasFlete.find((item) => item.codigo === input.zonaCodigo && item.activo);
  if (!zone) throw new AppError(422, "ZONA_NO_DISPONIBLE", "La zona seleccionada no está disponible");
  if (input.requiereBombeo && !config.comercial.bombeo.habilitado) throw new AppError(422, "BOMBEO_NO_DISPONIBLE", "El servicio de bombeo no está disponible");
  const increment = new Decimal(config.comercial.incrementoVolumenM3);
  const details = input.detalles.map((item) => {
    const element = config.elementos.find((entry) => entry.codigo === item.elementoCodigo && entry.activo);
    const resistance = config.resistencias.find((entry) => entry.codigo === item.resistenciaCodigo && entry.activo);
    if (!element || !resistance) throw new AppError(422, "CATALOGO_NO_DISPONIBLE", "Elemento o resistencia no disponible");
    if (element.geometria !== item.medicion.tipo) throw new AppError(422, "GEOMETRIA_INCOMPATIBLE", `Para ${element.nombre} use ${element.geometria}`);
    const waste = new Decimal(item.desperdicioPct ?? element.desperdicioSugeridoPct);
    if (waste.lt(config.comercial.desperdicioMinPct) || waste.gt(config.comercial.desperdicioMaxPct)) throw new AppError(422, "DESPERDICIO_FUERA_RANGO", "Desperdicio fuera del rango configurado");
    let net: Decimal;
    switch (item.medicion.tipo) {
      case "PRISMA": net = new Decimal(item.medicion.largoM).mul(item.medicion.anchoM).mul(item.medicion.altoM); break;
      case "CILINDRO": net = Decimal.acos(-1).mul(new Decimal(item.medicion.diametroM).div(2).pow(2)).mul(item.medicion.altoM); break;
      case "VOLUMEN_DIRECTO": net = new Decimal(item.medicion.volumenM3); break;
    }
    net = net.mul(item.cantidad);
    if (net.lt("0.001") || net.gt(10000)) throw new AppError(422, "VOLUMEN_FUERA_RANGO", "Cada detalle debe tener entre 0,001 y 10.000 m³ netos");
    const calculated = net.mul(waste.div(100).plus(1));
    const billed = calculated.div(increment).ceil().mul(increment);
    return {
      elementoCodigo: element.codigo, elementoNombre: element.nombre, resistenciaCodigo: resistance.codigo,
      fcKgfCm2: resistance.fcKgfCm2, slumpObjetivoMm: resistance.slumpObjetivoMm, agregadoMaxMm: resistance.agregadoMaxMm,
      cantidad: item.cantidad, medicion: item.medicion, desperdicioPct: waste.toString(),
      volumenNetoM3: volume(net), volumenConDesperdicioM3: volume(calculated), volumenTotalM3: volume(billed),
      precioUnitarioM3: money(new Decimal(resistance.precioM3)), subtotalHormigon: money(billed.mul(resistance.precioM3)),
    };
  });
  const totalVolume = details.reduce((sum, item) => sum.plus(item.volumenTotalM3), new Decimal(0));
  if (totalVolume.gt(10000)) throw new AppError(422, "VOLUMEN_FUERA_RANGO", "La solicitud supera 10.000 m³; requiere revisión comercial");
  const concrete = details.reduce((sum, item) => sum.plus(item.subtotalHormigon), new Decimal(0));
  const trips = totalVolume.div(config.logistica.capacidadReferenciaViajeM3).ceil().toNumber();
  const freight = config.comercial.flete.modelo === "POR_ZONA_M3"
    ? totalVolume.mul(zone.tarifaFleteM3)
    : Decimal.max(0, new Decimal(zone.distanciaKm).minus(config.comercial.flete.radioIncluidoKm)).mul(config.comercial.flete.tarifaKmPorViaje).mul(trips);
  const pump = input.requiereBombeo
    ? Decimal.max(config.comercial.bombeo.cargoMinimo, totalVolume.mul(config.comercial.bombeo.tarifaM3)) : new Decimal(0);
  const subtotal = concrete.plus(money(freight)).plus(money(pump));
  const tax = new Decimal(money(subtotal.mul(config.comercial.ivaPct).div(100)));
  return {
    versionConfiguracion: version, datosDemostracion: config.datosDemostracion, moneda: config.comercial.moneda,
    detalles: details, zona: { ...zone }, requiereBombeo: input.requiereBombeo,
    volumenTotalM3: volume(totalVolume), viajesEstimadosReferencia: trips,
    subtotalHormigon: money(concrete), subtotalFlete: money(freight), subtotalBombeo: money(pump),
    subtotalSinImpuesto: money(subtotal), ivaPct: config.comercial.ivaPct, impuesto: money(tax), total: money(subtotal.plus(tax)),
    condiciones: config.comercial.condiciones, fechaRequiereConfirmacion: true,
    avisos: [
      ...(config.datosDemostracion ? ["Datos y tarifas ficticios de demostración"] : []),
      "La fecha preferida y los viajes estimados no son una reserva de recursos",
      "La resistencia requerida debe provenir de la especificación de la obra",
    ],
  };
}
export type Calculation = ReturnType<typeof calculateQuotation>;
export type QuotationState = "PENDIENTE" | "CONTACTADA" | "APROBADA" | "RECHAZADA" | "VENCIDA";
export type Quotation = {
  id: string; codigo: string; estado: QuotationState; version: number;
  creadoEn: string; validaHasta: string; accesoExpiraEn: string;
  contacto: CreateQuotationInput["contacto"]; obra: CreateQuotationInput["obra"];
  calculo: Calculation; politicaEntrega: Configuration["calidad"];
};

export function stateAt(quotation: Quotation, now: Date): QuotationState {
  if (["PENDIENTE", "CONTACTADA"].includes(quotation.estado) && new Date(quotation.validaHasta).getTime() <= now.getTime()) return "VENCIDA";
  return quotation.estado;
}
