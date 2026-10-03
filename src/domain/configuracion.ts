import { Decimal } from "decimal.js";
import { z } from "zod";

export const roles = ["ADMINISTRADOR", "DESPACHADOR", "LABORATORISTA", "CONDUCTOR"] as const;
export type Role = (typeof roles)[number];
export type Actor = { id: string; email: string; nombre: string; rol: Role };

export function decimal(min: number, max: number, scale = 6) {
  return z.union([z.number().finite(), z.string().max(18).regex(/^\d+(?:\.\d{1,6})?$/)])
    .transform((value) => new Decimal(value).toString())
    .refine((value) => new Decimal(value).gte(min) && new Decimal(value).lte(max), `Valor entre ${min} y ${max}`)
    .refine((value) => new Decimal(value).decimalPlaces() <= scale, `Máximo ${scale} decimales`);
}

const code = z.string().regex(/^[A-Z][A-Z0-9_-]{1,39}$/);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const uniqueBy = <T>(items: T[], key: (item: T) => string | number) => new Set(items.map(key)).size === items.length;

export const resistanceSchema = z.strictObject({
  codigo: code, fcKgfCm2: z.int().min(100).max(1000), precioM3: decimal(1, 1000, 2),
  slumpObjetivoMm: decimal(0, 300, 3), agregadoMaxMm: decimal(1, 100, 3),
  descripcion: text(1, 240), activo: z.boolean(),
});
export const elementSchema = z.strictObject({
  codigo: code, nombre: text(1, 120), desperdicioSugeridoPct: decimal(0, 30, 3),
  geometria: z.enum(["PRISMA", "CILINDRO", "VOLUMEN_DIRECTO"]), activo: z.boolean(),
});
export const zoneSchema = z.strictObject({
  codigo: code, canton: text(1, 80), sector: text(1, 100), distanciaKm: decimal(0, 200, 3),
  trasladoEstimadoMin: z.int().min(1).max(600), tarifaFleteM3: decimal(0, 1000, 2), activo: z.boolean(),
});
export const mixerSchema = z.strictObject({
  codigo: code, placa: text(3, 30), marcaModelo: text(1, 100), capacidadM3: decimal(1, 20, 3),
  estado: z.enum(["DISPONIBLE", "MANTENIMIENTO", "INACTIVO"]),
});

export const configurationSchema = z.strictObject({
  datosDemostracion: z.boolean(),
  planta: z.strictObject({
    nombre: text(1, 120), provincia: text(1, 80), canton: text(1, 80),
    zonaHoraria: z.string().refine((value) => {
      try { new Intl.DateTimeFormat("es", { timeZone: value }); return true; } catch { return false; }
    }, "Zona horaria IANA inválida"),
    apertura: time, cierre: time, diasLaborables: z.array(z.int().min(1).max(7)).min(1).max(7),
    capacidadProduccionM3Hora: decimal(1, 1000),
  }),
  comercial: z.strictObject({
    moneda: z.literal("USD"), ivaPct: decimal(0, 30, 3), vigenciaDias: z.int().min(1).max(90),
    diasAccesoComprobante: z.int().min(1).max(365), desperdicioMinPct: decimal(0, 30, 3),
    desperdicioMaxPct: decimal(0, 30, 3), incrementoVolumenM3: decimal(0.001, 1),
    anticipacionPedidoHoras: z.int().min(0).max(720), modificacionesAnticipacionHoras: z.int().min(0).max(720),
    esperaIncluidaMin: z.int().min(0).max(180), tarifaEsperaHora: decimal(0, 1000, 2),
    flete: z.strictObject({ modelo: z.enum(["POR_ZONA_M3", "POR_DISTANCIA_VIAJE"]), radioIncluidoKm: decimal(0, 200, 3), tarifaKmPorViaje: decimal(0, 100, 2) }),
    bombeo: z.strictObject({ habilitado: z.boolean(), tarifaM3: decimal(0, 1000, 2), cargoMinimo: decimal(0, 10000, 2) }),
    condiciones: text(1, 2000),
  }),
  logistica: z.strictObject({
    cargaMin: z.int().min(1).max(180), descargaMin: z.int().min(1).max(180),
    retornoMin: z.int().min(1).max(600), lavadoMin: z.int().min(1).max(180), capacidadReferenciaViajeM3: decimal(1, 20),
  }),
  calidad: z.strictObject({
    limiteEntregaMin: z.int().min(1).max(300), avisoMin: z.int().min(1).max(299), criticoMin: z.int().min(1).max(300),
    referenciaNormativa: text(1, 300), referenciaVerificada: z.boolean(),
    edadesEnsayoDias: z.array(z.int().min(1).max(180)).min(1).max(10),
    slumpMinMm: decimal(0, 300), slumpMaxMm: decimal(0, 300), temperaturaMaxC: decimal(1, 60),
  }),
  resistencias: z.array(resistanceSchema).min(1).max(50),
  elementos: z.array(elementSchema).min(1).max(50),
  zonasFlete: z.array(zoneSchema).min(1).max(100),
  mixers: z.array(mixerSchema).min(1).max(100),
}).superRefine((value, ctx) => {
  const invalid = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (value.planta.apertura >= value.planta.cierre) invalid(["planta", "cierre"], "Debe ser posterior a apertura; turnos nocturnos aún no soportados");
  if (!uniqueBy(value.planta.diasLaborables, (day) => day)) invalid(["planta", "diasLaborables"], "Días repetidos");
  if (!uniqueBy(value.calidad.edadesEnsayoDias, (day) => day)) invalid(["calidad", "edadesEnsayoDias"], "Edades repetidas");
  if (!(value.calidad.avisoMin < value.calidad.criticoMin && value.calidad.criticoMin < value.calidad.limiteEntregaMin)) invalid(["calidad"], "Aviso < crítico < límite");
  if (new Decimal(value.comercial.desperdicioMinPct).gt(value.comercial.desperdicioMaxPct)) invalid(["comercial"], "Rango de desperdicio inválido");
  if (new Decimal(value.calidad.slumpMinMm).gt(value.calidad.slumpMaxMm)) invalid(["calidad"], "Rango de slump inválido");
  for (const key of ["resistencias", "elementos", "zonasFlete", "mixers"] as const) {
    if (!uniqueBy<{ codigo: string }>(value[key], (item) => item.codigo)) invalid([key], "Códigos repetidos");
  }
  if (!uniqueBy(value.mixers, (item) => item.placa.toUpperCase())) invalid(["mixers"], "Placas repetidas");
  for (const key of ["resistencias", "elementos", "zonasFlete"] as const) {
    if (!value[key].some((item) => item.activo)) invalid([key], "Se requiere al menos un registro activo");
  }
  value.elementos.forEach((item, index) => {
    if (item.activo && (new Decimal(item.desperdicioSugeridoPct).lt(value.comercial.desperdicioMinPct) || new Decimal(item.desperdicioSugeridoPct).gt(value.comercial.desperdicioMaxPct))) invalid(["elementos", index, "desperdicioSugeridoPct"], "Fuera del rango comercial");
  });
});

export type Configuration = z.infer<typeof configurationSchema>;
export type VersionedConfiguration = { version: number; configuracion: Configuration; creadoEn: string; motivo: string };
export const updateConfigurationSchema = z.strictObject({
  versionEsperada: z.int().positive(), motivo: text(5, 500), configuracion: configurationSchema,
});
