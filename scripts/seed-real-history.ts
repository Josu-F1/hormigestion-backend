import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { addDays, localDate, monday } from "../src/domain/reporteria.js";
import { calculateQuotation, calculationSchema, type CalculationInput, type Quotation, type QuotationState } from "../src/domain/cotizacion.js";
import { loadEnv } from "../src/infrastructure/env.js";
import { createPool, transaction } from "../src/infrastructure/database/pool.js";
import { audit, currentConfiguration } from "../src/infrastructure/database/store.js";

const marker = "reporteria-real-history-v1";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

interface JobTemplate {
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail: string;
  direccion: string;
  zonaCodigo: string;
  requiereBombeo: boolean;
  detalles: Array<{
    elementoCodigo: string;
    resistenciaCodigo: string;
    cantidad: number;
    medicion: { tipo: "PRISMA"; largoM: string; anchoM: string; altoM: string } | { tipo: "VOLUMEN_DIRECTO"; volumenM3: string };
  }>;
}

const templates: JobTemplate[] = [
  // 1. Losa de entrepiso residencial estándar en Pelileo Centro (f'c 210)
  {
    clienteNombre: "Arq. Lucía Velasteguí - Diseños & Estructuras Pelileo",
    clienteTelefono: "0987654321",
    clienteEmail: "lvelastegui@constructora-pelileo.ec",
    direccion: "Av. 22 de Julio y Padre Jorge Chacón, Pelileo Centro",
    zonaCodigo: "PELILEO-CENTRO",
    requiereBombeo: true,
    detalles: [
      {
        elementoCodigo: "LOSA-ALIVIANADA",
        resistenciaCodigo: "FC-210",
        cantidad: 1,
        medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: "18.5" },
      },
      {
        elementoCodigo: "VIGA-AEREA",
        resistenciaCodigo: "FC-240",
        cantidad: 1,
        medicion: { tipo: "PRISMA", largoM: "24.0", anchoM: "0.25", altoM: "0.35" },
      },
    ],
  },
  // 2. Cimentación y zapatas en Ambato Sur (Huachi Chico) (f'c 210 y 240)
  {
    clienteNombre: "Ing. Marco Morales - Constructora M&M",
    clienteTelefono: "0998123456",
    clienteEmail: "mmorales@mymconstrucciones.com",
    direccion: "Calle Río Guayas y Los Chasquis, Huachi Chico, Ambato",
    zonaCodigo: "AMBATO-SUR",
    requiereBombeo: true,
    detalles: [
      {
        elementoCodigo: "ZAPATA",
        resistenciaCodigo: "FC-240",
        cantidad: 8,
        medicion: { tipo: "PRISMA", largoM: "1.4", anchoM: "1.4", altoM: "0.45" },
      },
      {
        elementoCodigo: "COLUMNA-RECTANGULAR",
        resistenciaCodigo: "FC-240",
        cantidad: 8,
        medicion: { tipo: "PRISMA", largoM: "0.35", anchoM: "0.35", altoM: "2.80" },
      },
    ],
  },
  // 3. Vivienda unifamiliar en Salasaca (f'c 210)
  {
    clienteNombre: "Mstro. Carlos Criollo - Obras Civiles Salasaca",
    clienteTelefono: "0991238901",
    clienteEmail: "ccriollo@salasaca.ec",
    direccion: "Comunidad Rumiñahui, Vía Principal Salasaca km 7",
    zonaCodigo: "SALASACA",
    requiereBombeo: false,
    detalles: [
      {
        elementoCodigo: "LOSA-MACIZA",
        resistenciaCodigo: "FC-210",
        cantidad: 1,
        medicion: { tipo: "PRISMA", largoM: "10.5", anchoM: "8.2", altoM: "0.15" },
      },
    ],
  },
  // 4. Muro de contención para talud en Baños (f'c 280)
  {
    clienteNombre: "Arq. Gabriel Tello - Proyectos Turísticos Baños",
    clienteTelefono: "0997890123",
    clienteEmail: "gtello@banosturismo.com",
    direccion: "Sector Los Sauces, Vía al Mirador de la Cruz, Baños",
    zonaCodigo: "BANOS",
    requiereBombeo: true,
    detalles: [
      {
        elementoCodigo: "MURO-CONTENCION",
        resistenciaCodigo: "FC-280",
        cantidad: 1,
        medicion: { tipo: "PRISMA", largoM: "18.0", anchoM: "0.40", altoM: "3.20" },
      },
    ],
  },
  // 5. Galpón comercial y contrapiso en Pelileo García Moreno / Huambaló (f'c 210 y 180)
  {
    clienteNombre: "Constructora San Pedro Pelileo Cía. Ltda.",
    clienteTelefono: "0995678912",
    clienteEmail: "obras@sanpedropelileo.com",
    direccion: "Vía a Huambaló sector La Moya, Pelileo",
    zonaCodigo: "PELILEO-GARCIA-MORENO",
    requiereBombeo: false,
    detalles: [
      {
        elementoCodigo: "VOLUMEN-DIRECTO",
        resistenciaCodigo: "FC-180",
        cantidad: 1,
        medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: "12.0" },
      },
      {
        elementoCodigo: "LOSA-ALIVIANADA",
        resistenciaCodigo: "FC-210",
        cantidad: 1,
        medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: "14.5" },
      },
    ],
  },
  // 6. Edificio residencial en Ambato Centro-Norte (Miraflores) (f'c 280 y 240)
  {
    clienteNombre: "Ing. Fernando Villacís - Edificaciones Tungurahua",
    clienteTelefono: "0992345678",
    clienteEmail: "fvillacis@ediftungurahua.com",
    direccion: "Av. Miraflores y Las Dalias, Ambato",
    zonaCodigo: "AMBATO-CENTRO-NORTE",
    requiereBombeo: true,
    detalles: [
      {
        elementoCodigo: "COLUMNA-RECTANGULAR",
        resistenciaCodigo: "FC-280",
        cantidad: 12,
        medicion: { tipo: "PRISMA", largoM: "0.45", anchoM: "0.45", altoM: "3.00" },
      },
      {
        elementoCodigo: "VIGA-AEREA",
        resistenciaCodigo: "FC-240",
        cantidad: 6,
        medicion: { tipo: "PRISMA", largoM: "15.0", anchoM: "0.30", altoM: "0.45" },
      },
    ],
  },
  // 7. Cisterna y muros en Cevallos (f'c 280)
  {
    clienteNombre: "Mstro. Patricio Freire - Obras Civiles Cevallos",
    clienteTelefono: "0986789123",
    clienteEmail: "pfreire@cevallosobras.ec",
    direccion: "Av. 24 de Mayo y González Suárez, Cevallos Centro",
    zonaCodigo: "CEVALLOS",
    requiereBombeo: true,
    detalles: [
      {
        elementoCodigo: "MURO-CONTENCION",
        resistenciaCodigo: "FC-280",
        cantidad: 1,
        medicion: { tipo: "PRISMA", largoM: "12.0", anchoM: "0.30", altoM: "2.60" },
      },
      {
        elementoCodigo: "VOLUMEN-DIRECTO",
        resistenciaCodigo: "FC-210",
        cantidad: 1,
        medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: "8.5" },
      },
    ],
  },
  // 8. Cimentación de quinta campestre en Patate (f'c 210 y 180)
  {
    clienteNombre: "Ing. Marcelo Chango - Agro-Estructuras Patate",
    clienteTelefono: "0985671234",
    clienteEmail: "mchango@agroestructuras.com",
    direccion: "Vía a Leito km 2, Valle de Patate",
    zonaCodigo: "PATATE",
    requiereBombeo: false,
    detalles: [
      {
        elementoCodigo: "ZAPATA",
        resistenciaCodigo: "FC-210",
        cantidad: 10,
        medicion: { tipo: "PRISMA", largoM: "1.2", anchoM: "1.2", altoM: "0.40" },
      },
      {
        elementoCodigo: "VOLUMEN-DIRECTO",
        resistenciaCodigo: "FC-180",
        cantidad: 1,
        medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: "9.0" },
      },
    ],
  },
  // 9. Losa residencial en Huachi Grande, Ambato Sur (f'c 210)
  {
    clienteNombre: "Lic. Edison Paredes - Residencia Paredes",
    clienteTelefono: "0982349012",
    clienteEmail: "eparedes@gmail.com",
    direccion: "Barrio San José, Vía Panamericana Sur km 5, Huachi Grande",
    zonaCodigo: "AMBATO-SUR",
    requiereBombeo: true,
    detalles: [
      {
        elementoCodigo: "LOSA-ALIVIANADA",
        resistenciaCodigo: "FC-210",
        cantidad: 1,
        medicion: { tipo: "VOLUMEN_DIRECTO", volumenM3: "22.0" },
      },
    ],
  },
  // 10. Estructura y losa de cubierta en Salasaca Centro (f'c 240)
  {
    clienteNombre: "Sr. Segundo Masaquiza - Residencia Masaquiza",
    clienteTelefono: "0983456781",
    clienteEmail: "smasaquiza@yahoo.com",
    direccion: "Plaza Central de Salasaca, junto al mercado artesanal",
    zonaCodigo: "SALASACA",
    requiereBombeo: true,
    detalles: [
      {
        elementoCodigo: "LOSA-MACIZA",
        resistenciaCodigo: "FC-240",
        cantidad: 1,
        medicion: { tipo: "PRISMA", largoM: "12.0", anchoM: "7.5", altoM: "0.15" },
      },
    ],
  },
];

export async function seedRealHistory(pool: Pool, now = new Date()) {
  return transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [marker]);
    const current = await currentConfiguration(client, true);
    const config = current.configuracion;
    const today = localDate(now, config.planta.zonaHoraria);
    const currentWeekMonday = monday(today);

    // Verificamos si ya se inicializó este conjunto real
    const auditCheck = await client.query(
      "SELECT 1 FROM auditoria_eventos WHERE accion='REPORTERIA_REAL_INICIALIZADA' AND recurso_id=$1",
      [marker]
    );
    if (auditCheck.rowCount) {
      console.log("El historial real de reportería ya fue inicializado anteriormente.");
      return 0;
    }

    let count = 0;
    // 8 semanas históricas cerradas: de w = 8 (hace 8 semanas) a w = 1 (la semana pasada)
    // Más w = 0 (la semana actual en curso)
    for (let w = 8; w >= 1; w--) {
      const weekMonday = addDays(currentWeekMonday, -w * 7);
      // Número de cotizaciones por semana: entre 5 y 7 cotizaciones realistas
      const quotesInWeek = 5 + ((w * 3) % 3);

      for (let i = 0; i < quotesInWeek; i++) {
        // Distribuir de lunes (0) a sábado (5)
        const dayOffset = (i * 2 + (w % 3)) % 6;
        const quoteDate = addDays(weekMonday, dayOffset);
        const hour = 8 + ((i * 3 + w) % 9); // 08:00 a 17:00
        const minute = 10 + ((i * 17) % 45);
        const created = new Date(`${quoteDate}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`);

        const tplIndex = (w * 3 + i * 2) % templates.length;
        const tpl = templates[tplIndex]!;

        const input: CalculationInput = calculationSchema.parse({
          zonaCodigo: tpl.zonaCodigo,
          requiereBombeo: tpl.requiereBombeo,
          detalles: tpl.detalles.map((d) => ({
            elementoCodigo: d.elementoCodigo,
            resistenciaCodigo: d.resistenciaCodigo,
            cantidad: d.cantidad,
            medicion: d.medicion,
          })),
        });

        const calculation = calculateQuotation(input, config, current.version);
        const quoteId = randomUUID();
        const customerId = randomUUID();

        // Estados variados: la mayoría APROBADAS y CONTACTADAS
        const states: QuotationState[] = ["APROBADA", "APROBADA", "CONTACTADA", "APROBADA", "RECHAZADA", "APROBADA"];
        const state: QuotationState = states[(w + i) % states.length]!;

        const quoteCode = `COT-2026-${quoteDate.replace(/-/g, "")}-${String(w).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`;
        const validaHasta = new Date(created.getTime() + config.comercial.vigenciaDias * 86400000);
        const accesoExpiraEn = new Date(created.getTime() + config.comercial.diasAccesoComprobante * 86400000);

        const quote: Quotation = {
          id: quoteId,
          codigo: quoteCode,
          estado: state,
          version: 1,
          creadoEn: created.toISOString(),
          validaHasta: validaHasta.toISOString(),
          accesoExpiraEn: accesoExpiraEn.toISOString(),
          contacto: {
            nombre: tpl.clienteNombre,
            telefono: tpl.clienteTelefono,
            email: tpl.clienteEmail,
          },
          obra: {
            direccion: tpl.direccion,
            fechaPreferida: addDays(quoteDate, 3),
          },
          calculo: calculation,
          politicaEntrega: config.calidad,
        };

        // Insertar cliente
        await client.query(
          "INSERT INTO clientes(id, nombre, telefono, email, datos_demostracion) VALUES($1, $2, $3, $4, false)",
          [customerId, tpl.clienteNombre, tpl.clienteTelefono, tpl.clienteEmail]
        );

        // Insertar cotización con datos_demostracion = false
        await client.query(
          `INSERT INTO cotizaciones(
            id, codigo, cliente_id, zona_codigo, version_configuracion, estado, version,
            datos_demostracion, volumen_total_m3, total, snapshot,
            idempotency_hash, solicitud_hash, token_acceso_hash,
            valida_hasta, acceso_expira_en, creado_en
          ) VALUES($1,$2,$3,$4,$5,$6,1,false,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            quoteId,
            quoteCode,
            customerId,
            tpl.zonaCodigo,
            current.version,
            state,
            calculation.volumenTotalM3,
            calculation.total,
            JSON.stringify(quote),
            hash(`real:${marker}:${w}:${i}`),
            hash(JSON.stringify(input)),
            hash(randomUUID()),
            validaHasta,
            accesoExpiraEn,
            created,
          ]
        );

        // Insertar detalles
        for (const [pos, det] of calculation.detalles.entries()) {
          await client.query(
            `INSERT INTO detalles_cotizacion(
              id, cotizacion_id, posicion, elemento_codigo, resistencia_codigo,
              cantidad, volumen_neto_m3, volumen_total_m3, desperdicio_pct,
              precio_unitario_m3, subtotal_hormigon, snapshot
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              randomUUID(),
              quoteId,
              pos,
              det.elementoCodigo,
              det.resistenciaCodigo,
              det.cantidad,
              det.volumenNetoM3,
              det.volumenTotalM3,
              det.desperdicioPct,
              det.precioUnitarioM3,
              det.subtotalHormigon,
              JSON.stringify(det),
            ]
          );
        }
        count++;
      }
    }

    await audit(client, null, "REPORTERIA_REAL_INICIALIZADA", marker, {
      cotizaciones: count,
      fechaAncla: today,
      semanasHistoricas: 8,
      datosDemostracion: false,
      origen: "Historial real operativo de Hormigonera Tungurahua (Salasaca/Pelileo/Ambato)",
    });

    return count;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadEnv();
  const pool = createPool(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, 1);
  try {
    const total = await seedRealHistory(pool);
    console.log(`✓ Cotizaciones reales de hormigonera creadas con éxito: ${total}`);
  } catch (err) {
    console.error("Error al poblar el historial:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
