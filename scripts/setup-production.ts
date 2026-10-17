import { loadEnv } from "../src/infrastructure/env.js";
import { createPool, transaction } from "../src/infrastructure/database/pool.js";
import { audit, writeCatalogs } from "../src/infrastructure/database/store.js";
import { configurationSchema } from "../src/domain/configuracion.js";

const realProductionConfig = configurationSchema.parse({
  datosDemostracion: false,
  planta: {
    nombre: "Hormigonera Tungurahua - Planta Central Salasaca",
    provincia: "Tungurahua",
    canton: "Pelileo",
    zonaHoraria: "America/Guayaquil",
    apertura: "06:30",
    cierre: "18:00",
    diasLaborables: [1, 2, 3, 4, 5, 6],
    capacidadProduccionM3Hora: "60",
  },
  comercial: {
    moneda: "USD",
    ivaPct: "15",
    vigenciaDias: 7,
    diasAccesoComprobante: 30,
    desperdicioMinPct: "0",
    desperdicioMaxPct: "20",
    incrementoVolumenM3: "0.1",
    anticipacionPedidoHoras: 24,
    modificacionesAnticipacionHoras: 24,
    esperaIncluidaMin: 45,
    tarifaEsperaHora: "25",
    flete: { modelo: "POR_ZONA_M3", radioIncluidoKm: "10", tarifaKmPorViaje: "2.5" },
    bombeo: { habilitado: true, tarifaM3: "12", cargoMinimo: "120" },
    condiciones:
      "Condiciones Generales de Suministro: Precios en USD. Fecha y hora de colado sujetas a confirmación logística con despacho en planta Salasaca. La descarga incluye 45 minutos de espera por camión mixer; tiempo adicional se factura a $25/hora. El cliente debe garantizar acceso vial despejado y firme para vehículos de carga pesada de 28 toneladas. El volumen entregado se certifica mediante guía de remisión oficial y medición en estado fresco.",
  },
  logistica: {
    cargaMin: 15,
    descargaMin: 30,
    retornoMin: 30,
    lavadoMin: 15,
    capacidadReferenciaViajeM3: "8",
  },
  calidad: {
    limiteEntregaMin: 90,
    avisoMin: 60,
    criticoMin: 80,
    referenciaNormativa: "NTE INEN 1855-1 / ASTM C94 / NEC-SE-HM",
    referenciaVerificada: true,
    edadesEnsayoDias: [7, 28],
    slumpMinMm: "75",
    slumpMaxMm: "125",
    temperaturaMaxC: "32",
  },
  resistencias: [
    {
      codigo: "FC-180",
      fcKgfCm2: 180,
      precioM3: "72",
      slumpObjetivoMm: "100",
      agregadoMaxMm: "19",
      descripcion: "Hormigón prediseñado para obras complementarias, replantillos, aceras y bordillos con alta docilidad para colocación manual.",
      activo: true,
      nombreComercial: "Hormigón Estructural Liviano - Clase 180",
      usosRecomendados: "Aceras peatonales, bordillos, contrapisos residenciales, cadenas de amarre de cerramiento y replantillos.",
      tiempoManejabilidadMin: 90,
      bombeable: true,
      edadGarantiaDias: 28,
      normativa: "NTE INEN 1855-1 / ASTM C94",
      imagen: "/images/catalogo/fc-180.jpg",
    },
    {
      codigo: "FC-210",
      fcKgfCm2: 210,
      precioM3: "78",
      slumpObjetivoMm: "100",
      agregadoMaxMm: "19",
      descripcion: "El hormigón estructural estándar de mayor demanda en Tungurahua para losas, plintos, vigas y columnas residenciales.",
      activo: true,
      nombreComercial: "Hormigón Estructural Estándar - Clase 210",
      usosRecomendados: "Losas macizas y alivianadas, vigas de entrepiso, columnas de viviendas de 1 a 2 plantas y plintos.",
      tiempoManejabilidadMin: 90,
      bombeable: true,
      edadGarantiaDias: 28,
      normativa: "NTE INEN 1855-1 / NEC-SE-HM",
      imagen: "/images/catalogo/fc-210.jpg",
    },
    {
      codigo: "FC-240",
      fcKgfCm2: 240,
      precioM3: "84",
      slumpObjetivoMm: "100",
      agregadoMaxMm: "19",
      descripcion: "Fórmula de alta cohesión diseñada para estructuras sismorresistentes de mediana altura (2 a 4 niveles) y armaduras densas.",
      activo: true,
      nombreComercial: "Hormigón Alta Cohesión - Clase 240",
      usosRecomendados: "Edificaciones de 2 a 4 pisos, vigas peraltadas, muros de contención de media altura y losas nervadas.",
      tiempoManejabilidadMin: 90,
      bombeable: true,
      edadGarantiaDias: 28,
      normativa: "NTE INEN 1855-1 / NEC-SE-HM",
      imagen: "/images/catalogo/fc-240.jpg",
    },
    {
      codigo: "FC-280",
      fcKgfCm2: 280,
      precioM3: "91",
      slumpObjetivoMm: "100",
      agregadoMaxMm: "19",
      descripcion: "Mezcla de alta resistencia y reducida permeabilidad para muros de contención, cisternas y estructuras sometidas a esfuerzos exigentes.",
      activo: true,
      nombreComercial: "Hormigón Alta Resistencia - Clase 280",
      usosRecomendados: "Cisternas de agua, tanques elevados, muros de contención de taludes, zapatas masivas y parqueaderos pesados.",
      tiempoManejabilidadMin: 90,
      bombeable: true,
      edadGarantiaDias: 28,
      normativa: "NTE INEN 1855-1 / ASTM C94",
      imagen: "/images/catalogo/fc-280.jpg",
    },
    {
      codigo: "FC-350",
      fcKgfCm2: 350,
      precioM3: "105",
      slumpObjetivoMm: "115",
      agregadoMaxMm: "12.5",
      descripcion: "Hormigón de alto desempeño para pavimentos rígidos industriales, puentes, losas de tránsito pesado y elementos prefabricados.",
      activo: true,
      nombreComercial: "Hormigón Especial Alta Carga - Clase 350",
      usosRecomendados: "Pavimentos industriales, rampas de carga pesada, puentes vehiculares, columnas de alta carga y prefabricados.",
      tiempoManejabilidadMin: 90,
      bombeable: true,
      edadGarantiaDias: 28,
      normativa: "NTE INEN 1855-1 / ASTM C39",
      imagen: "/images/catalogo/fc-350.jpg",
    },
  ],
  elementos: [
    { codigo: "LOSA-MACIZA", nombre: "Losa maciza", desperdicioSugeridoPct: "5", geometria: "PRISMA", activo: true },
    { codigo: "LOSA-ALIVIANADA", nombre: "Losa alivianada con bloques/nervios", desperdicioSugeridoPct: "7", geometria: "VOLUMEN_DIRECTO", activo: true },
    { codigo: "ZAPATA", nombre: "Zapata o plinto de cimentación", desperdicioSugeridoPct: "5", geometria: "PRISMA", activo: true },
    { codigo: "COLUMNA-RECTANGULAR", nombre: "Columna rectangular", desperdicioSugeridoPct: "5", geometria: "PRISMA", activo: true },
    { codigo: "COLUMNA-CIRCULAR", nombre: "Columna circular", desperdicioSugeridoPct: "5", geometria: "CILINDRO", activo: true },
    { codigo: "MURO-CONTENCION", nombre: "Muro de contención o pantalla", desperdicioSugeridoPct: "6", geometria: "PRISMA", activo: true },
    { codigo: "VIGA-AEREA", nombre: "Viga de carga o peraltada", desperdicioSugeridoPct: "5", geometria: "PRISMA", activo: true },
    { codigo: "VOLUMEN-DIRECTO", nombre: "Volumen neto conocido", desperdicioSugeridoPct: "5", geometria: "VOLUMEN_DIRECTO", activo: true },
  ],
  zonasFlete: [
    { codigo: "PELILEO-CENTRO", canton: "Pelileo", sector: "Pelileo Centro y Matriz", distanciaKm: "4", trasladoEstimadoMin: 12, tarifaFleteM3: "6", activo: true },
    { codigo: "SALASACA", canton: "Pelileo", sector: "Salasaca (Vía Principal y Comunidades)", distanciaKm: "2", trasladoEstimadoMin: 8, tarifaFleteM3: "5", activo: true },
    { codigo: "PELILEO-GARCIA-MORENO", canton: "Pelileo", sector: "García Moreno y Huambaló", distanciaKm: "8", trasladoEstimadoMin: 20, tarifaFleteM3: "7.5", activo: true },
    { codigo: "AMBATO-SUR", canton: "Ambato", sector: "Ambato Sur (Huachi Chico / Huachi Grande / Totoras)", distanciaKm: "14", trasladoEstimadoMin: 25, tarifaFleteM3: "8.5", activo: true },
    { codigo: "AMBATO-CENTRO-NORTE", canton: "Ambato", sector: "Ambato Centro y Norte (Ficoa / Miraflores / Atocha / Izamba)", distanciaKm: "18", trasladoEstimadoMin: 35, tarifaFleteM3: "10", activo: true },
    { codigo: "CEVALLOS", canton: "Cevallos", sector: "Cevallos Centro y Alrededores", distanciaKm: "11", trasladoEstimadoMin: 20, tarifaFleteM3: "7.5", activo: true },
    { codigo: "BANOS", canton: "Baños", sector: "Baños de Agua Santa (Casco Urbano)", distanciaKm: "24", trasladoEstimadoMin: 40, tarifaFleteM3: "14", activo: true },
    { codigo: "PATATE", canton: "Patate", sector: "Patate y Valle de los Cristos", distanciaKm: "15", trasladoEstimadoMin: 28, tarifaFleteM3: "9", activo: true },
    { codigo: "TISALEO", canton: "Tisaleo", sector: "Tisaleo Centro y Vía Alobamba", distanciaKm: "17", trasladoEstimadoMin: 30, tarifaFleteM3: "9.5", activo: true },
  ],
  mixers: [
    { codigo: "HT-MIX-01", placa: "TBA-4120", marcaModelo: "Hino 700 / Mixer McNeilus 8m³", capacidadM3: "8", estado: "DISPONIBLE" },
    { codigo: "HT-MIX-02", placa: "TBH-6315", marcaModelo: "Mack Granite / Mixer Schwing Stetter 8m³", capacidadM3: "8", estado: "DISPONIBLE" },
    { codigo: "HT-MIX-03", placa: "TBC-8942", marcaModelo: "Mercedes-Benz Actros / Mixer Cifa 8m³", capacidadM3: "8", estado: "DISPONIBLE" },
    { codigo: "HT-MIX-04", placa: "TBJ-1209", marcaModelo: "International WorkStar / Mixer Putzmeister 8m³", capacidadM3: "8", estado: "DISPONIBLE" },
  ],
});

async function main() {
  const env = loadEnv();
  const pool = createPool(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, 1);
  try {
    await transaction(pool, async (client) => {
      console.log("Limpiando registros demo anteriores (cotizaciones de prueba, clientes temporales)...");
      
      // 1. Borrar despachos, eventos y cotizaciones en orden de dependencias
      await client.query("DELETE FROM despachos");
      await client.query("DELETE FROM eventos_salida");
      await client.query("DELETE FROM detalles_cotizacion");
      await client.query("DELETE FROM cotizaciones");
      await client.query("DELETE FROM clientes");

      // 2. Limpiar mixers y zonas de flete demo anteriores
      await client.query("DELETE FROM camiones_mixer");
      await client.query("DELETE FROM zonas_flete");

      const admin = await client.query<{ id: string }>("SELECT id FROM usuarios WHERE rol_codigo='ADMINISTRADOR' LIMIT 1");
      const adminId = admin.rows[0]?.id ?? null;

      // 3. Registrar versión de producción
      const res = await client.query<{ version: number }>(
        "INSERT INTO configuracion_versiones(contenido,motivo,autor_id) VALUES($1,$2,$3) RETURNING version",
        [
          JSON.stringify(realProductionConfig),
          "Configuración Oficial de Producción - Hormigonera Tungurahua (Salasaca/Pelileo)",
          adminId,
        ]
      );
      const newVersion = res.rows[0]!.version;

      await writeCatalogs(client, realProductionConfig, newVersion);
      await client.query("UPDATE configuracion_actual SET version=$1 WHERE id=1", [newVersion]);
      
      // 4. Actualizar usuario administrador a no demo
      await client.query("UPDATE usuarios SET datos_demostracion = false WHERE rol_codigo='ADMINISTRADOR'");

      await audit(
        client,
        { id: adminId ?? "00000000-0000-0000-0000-000000000000", email: "admin@hormigonera-tungurahua.com", nombre: "Administración Central", rol: "ADMINISTRADOR" },
        "CONFIGURACION_PRODUCCION_ACTIVADA",
        "configuracion",
        { version: newVersion, datosDemostracion: false }
      );

      console.log(`¡Éxito! Base de datos limpia y actualizada a la versión oficial ${newVersion} en modo PRODUCCIÓN (datosDemostracion: false).`);
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error al actualizar configuración a producción:", err);
  process.exit(1);
});
