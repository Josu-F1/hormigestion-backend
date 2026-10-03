import assert from "node:assert/strict";
import { test } from "node:test";
import { calculationSchema, calculateQuotation, createQuotationSchema } from "../../src/domain/cotizacion.js";
import { configurationSchema } from "../../src/domain/configuracion.js";
import { demoConfiguration } from "../../src/domain/demo.js";
import { AppError } from "../../src/domain/errors.js";

const slab = { zonaCodigo: "AMBATO-HUACHI", detalles: [{ elementoCodigo: "LOSA-MACIZA", resistenciaCodigo: "FC-210", cantidad: 1, medicion: { tipo: "PRISMA", largoM: "10", anchoM: "5", altoM: "0.1" } }] };
const direct = (net: string, waste = "0") => calculationSchema.parse({ zonaCodigo: "PELILEO-CENTRO", detalles: [{ elementoCodigo: "VOLUMEN-DIRECTO", resistenciaCodigo: "FC-210", desperdicioPct: waste, medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: net } }] });
test("losas: volumen, redondeo, flete e impuesto decimales reproducibles", () => {
  const value = calculateQuotation(calculationSchema.parse(slab), demoConfiguration, 1);
  assert.equal(value.detalles[0]!.volumenNetoM3, "5.000000");
  assert.equal(value.volumenTotalM3, "5.300000");
  assert.equal(value.subtotalHormigon, "413.40");
  assert.equal(value.subtotalFlete, "47.70");
  assert.equal(value.impuesto, "69.17");
  assert.equal(value.total, "530.27");
  assert.equal(value.fechaRequiereConfirmacion, true);
});
test("20 m³ no se rechazan por la capacidad de un mixer", () => {
  const value = calculateQuotation(direct("20"), demoConfiguration, 1);
  assert.equal(value.volumenTotalM3, "20.000000");
  assert.equal(value.viajesEstimadosReferencia, 3);
});
test("0,1 + 0,2 no redondea el volumen a un incremento adicional", () => {
  const input = direct("0.1");
  input.detalles.push(direct("0.2").detalles[0]!);
  const value = calculateQuotation(input, demoConfiguration, 1);
  assert.equal(value.volumenTotalM3, "0.300000");
  assert.equal(value.subtotalHormigon, "23.40");
});
test("bombeo aplica mínimo y luego tarifa por volumen", () => {
  const small = direct("2"); small.requiereBombeo = true;
  assert.equal(calculateQuotation(small, demoConfiguration, 1).subtotalBombeo, "120.00");
  const large = direct("20"); large.requiereBombeo = true;
  assert.equal(calculateQuotation(large, demoConfiguration, 1).subtotalBombeo, "240.00");
});
test("flete por distancia: radio incluido y número estimado de viajes", () => {
  const config = structuredClone(demoConfiguration);
  config.comercial.flete.modelo = "POR_DISTANCIA_VIAJE";
  const inside = calculateQuotation(direct("20"), config, 2);
  assert.equal(inside.subtotalFlete, "0.00");
  const outside = direct("20"); outside.zonaCodigo = "AMBATO-HUACHI";
  assert.equal(calculateQuotation(outside, config, 2).subtotalFlete, "30.00");
});
test("cilindro usa diámetro, altura y cantidad", () => {
  const input = calculationSchema.parse({ zonaCodigo: "PELILEO-CENTRO", detalles: [{ elementoCodigo: "COLUMNA-CIRCULAR", resistenciaCodigo: "FC-210", cantidad: 2, desperdicioPct: "0", medicion: { tipo: "CILINDRO", diametroM: "1", altoM: "1" } }] });
  const value = calculateQuotation(input, demoConfiguration, 1);
  assert.equal(value.detalles[0]!.volumenNetoM3, "1.570796");
  assert.equal(value.volumenTotalM3, "1.600000");
});
test("losa alivianada exige volumen neto; no confunde huecos con hormigón", () => {
  const input = calculationSchema.parse(slab); input.detalles[0]!.elementoCodigo = "LOSA-ALIVIANADA";
  assert.throws(() => calculateQuotation(input, demoConfiguration, 1), (error) => error instanceof AppError && error.code === "GEOMETRIA_INCOMPATIBLE");
});
test("rechaza catálogo inactivo, desperdicio fuera de rango y precio manipulado", () => {
  const config = structuredClone(demoConfiguration); config.resistencias.find((item) => item.codigo === "FC-210")!.activo = false;
  assert.throws(() => calculateQuotation(direct("2"), config, 1));
  assert.throws(() => calculateQuotation(direct("2", "21"), demoConfiguration, 1));
  assert.equal(calculationSchema.safeParse({ ...slab, total: "0.01" }).success, false);
});
test("nueva tarifa cambia el cálculo, no modifica objetos históricos", () => {
  const old = calculateQuotation(direct("2"), demoConfiguration, 1);
  const config = structuredClone(demoConfiguration); config.resistencias.find((item) => item.codigo === "FC-210")!.precioM3 = "90";
  const next = calculateQuotation(direct("2"), configurationSchema.parse(config), 2);
  assert.equal(old.subtotalHormigon, "156.00");
  assert.equal(next.subtotalHormigon, "180.00");
});
test("solicitud requiere contacto, fecha válida y versión calculada", () => {
  assert.equal(createQuotationSchema.safeParse(slab).success, false);
  assert.equal(createQuotationSchema.safeParse({ ...slab, versionConfiguracion: 1, contacto: { nombre: "Cliente DEMO", telefono: "0990000000" }, obra: { direccion: "Dirección ficticia DEMO", fechaPreferida: "2026-02-30" } }).success, false);
});
