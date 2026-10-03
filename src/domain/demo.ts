import { configurationSchema } from "./configuracion.js";

// Datos sintéticos de desarrollo: no son tarifas ni parámetros técnicos certificados.
export const demoConfiguration = configurationSchema.parse({
  datosDemostracion: true,
  planta: { nombre: "Planta HormiGestión DEMO", provincia: "Tungurahua", canton: "Pelileo", zonaHoraria: "America/Guayaquil", apertura: "07:00", cierre: "17:00", diasLaborables: [1, 2, 3, 4, 5, 6], capacidadProduccionM3Hora: "40" },
  comercial: {
    moneda: "USD", ivaPct: "15", vigenciaDias: 7, diasAccesoComprobante: 30,
    desperdicioMinPct: "0", desperdicioMaxPct: "20", incrementoVolumenM3: "0.1",
    anticipacionPedidoHoras: 24, modificacionesAnticipacionHoras: 24,
    esperaIncluidaMin: 45, tarifaEsperaHora: "25",
    flete: { modelo: "POR_ZONA_M3", radioIncluidoKm: "10", tarifaKmPorViaje: "2.5" },
    bombeo: { habilitado: true, tarifaM3: "12", cargoMinimo: "120" },
    condiciones: "DEMONSTRACIÓN: tarifas, impuesto y condiciones ficticias. Fecha preferida sujeta a confirmación de despacho. Cambios y cancelaciones requieren revisión. El volumen calculado no define la resistencia estructural requerida.",
  },
  logistica: { cargaMin: 15, descargaMin: 30, retornoMin: 30, lavadoMin: 15, capacidadReferenciaViajeM3: "8" },
  calidad: { limiteEntregaMin: 90, avisoMin: 60, criticoMin: 80, referenciaNormativa: "NTE INEN 1855-1: edición y cláusulas pendientes de verificación", referenciaVerificada: false, edadesEnsayoDias: [7, 28], slumpMinMm: "75", slumpMaxMm: "125", temperaturaMaxC: "32" },
  resistencias: [
    { codigo: "FC-180", fcKgfCm2: 180, precioM3: "72", slumpObjetivoMm: "100", agregadoMaxMm: "19", descripcion: "Mezcla de demostración f'c 180", activo: true },
    { codigo: "FC-210", fcKgfCm2: 210, precioM3: "78", slumpObjetivoMm: "100", agregadoMaxMm: "19", descripcion: "Mezcla de demostración f'c 210", activo: true },
    { codigo: "FC-240", fcKgfCm2: 240, precioM3: "84", slumpObjetivoMm: "100", agregadoMaxMm: "19", descripcion: "Mezcla de demostración f'c 240", activo: true },
    { codigo: "FC-280", fcKgfCm2: 280, precioM3: "91", slumpObjetivoMm: "100", agregadoMaxMm: "19", descripcion: "Mezcla de demostración f'c 280", activo: true },
    { codigo: "FC-350", fcKgfCm2: 350, precioM3: "105", slumpObjetivoMm: "115", agregadoMaxMm: "12.5", descripcion: "Mezcla de demostración f'c 350", activo: true },
  ],
  elementos: [
    { codigo: "LOSA-MACIZA", nombre: "Losa maciza", desperdicioSugeridoPct: "5", geometria: "PRISMA", activo: true },
    { codigo: "LOSA-ALIVIANADA", nombre: "Losa alivianada: ingresar volumen neto", desperdicioSugeridoPct: "8", geometria: "VOLUMEN_DIRECTO", activo: true },
    { codigo: "ZAPATA", nombre: "Zapata o plinto", desperdicioSugeridoPct: "7", geometria: "PRISMA", activo: true },
    { codigo: "COLUMNA-RECTANGULAR", nombre: "Columna rectangular", desperdicioSugeridoPct: "6", geometria: "PRISMA", activo: true },
    { codigo: "COLUMNA-CIRCULAR", nombre: "Columna circular", desperdicioSugeridoPct: "6", geometria: "CILINDRO", activo: true },
    { codigo: "VOLUMEN-DIRECTO", nombre: "Volumen neto conocido", desperdicioSugeridoPct: "5", geometria: "VOLUMEN_DIRECTO", activo: true },
  ],
  zonasFlete: [
    { codigo: "PELILEO-CENTRO", canton: "Pelileo", sector: "Centro DEMO", distanciaKm: "4", trasladoEstimadoMin: 12, tarifaFleteM3: "6", activo: true },
    { codigo: "SALASACA", canton: "Pelileo", sector: "Salasaca DEMO", distanciaKm: "7.5", trasladoEstimadoMin: 18, tarifaFleteM3: "7.5", activo: true },
    { codigo: "AMBATO-HUACHI", canton: "Ambato", sector: "Huachi DEMO", distanciaKm: "14", trasladoEstimadoMin: 28, tarifaFleteM3: "9", activo: true },
    { codigo: "AMBATO-FICOA", canton: "Ambato", sector: "Ficoa DEMO", distanciaKm: "18.5", trasladoEstimadoMin: 35, tarifaFleteM3: "11", activo: true },
    { codigo: "CEVALLOS", canton: "Cevallos", sector: "Centro DEMO", distanciaKm: "12", trasladoEstimadoMin: 22, tarifaFleteM3: "8.5", activo: true },
    { codigo: "BANOS", canton: "Baños", sector: "Centro DEMO", distanciaKm: "26", trasladoEstimadoMin: 45, tarifaFleteM3: "15", activo: true },
  ],
  mixers: [
    { codigo: "DEMO-MIXER-01", placa: "DEMO-001", marcaModelo: "Mixer de demostración A", capacidadM3: "8", estado: "DISPONIBLE" },
    { codigo: "DEMO-MIXER-02", placa: "DEMO-002", marcaModelo: "Mixer de demostración B", capacidadM3: "7.5", estado: "DISPONIBLE" },
    { codigo: "DEMO-MIXER-03", placa: "DEMO-003", marcaModelo: "Mixer de demostración C", capacidadM3: "8", estado: "MANTENIMIENTO" },
  ],
});
