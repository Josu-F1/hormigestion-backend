import { z } from "zod";
import { configurationSchema, updateConfigurationSchema } from "../domain/configuracion.js";
import { calculationSchema, createQuotationSchema } from "../domain/cotizacion.js";
import { loginSchema, newUserSchema, userChangesSchema } from "../application/services.js";
import { reportFiltersSchema } from "../domain/reporteria.js";

const schema = (value: z.ZodType) => z.toJSONSchema(value, { io: "input", unrepresentable: "any" });
const jsonResponse = (description: string, reference?: string) => ({ description, ...(reference ? { content: { "application/json": { schema: { $ref: `#/components/schemas/${reference}` } } } } : {}) });
const request = (reference: string) => ({ required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${reference}` } } } });
const staff = [{ staffBearer: [] }];
const receipt = [{ receiptBearer: [] }, { staffBearer: [] }];
const idParameter = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const errors = { "400": jsonResponse("Campos inválidos", "Error"), "401": jsonResponse("Sesión o token inválido", "Error"), "403": jsonResponse("Permiso denegado", "Error"), "409": jsonResponse("Versión, estado o clave en conflicto", "Error"), "422": jsonResponse("Regla de negocio incumplida", "Error"), "429": jsonResponse("Límite de solicitudes", "Error"), "503": jsonResponse("Dependencia no disponible", "Error") };
const stateInput = z.strictObject({ versionEsperada: z.int().positive(), motivo: z.string().min(5).max(500) });

export const openApi = {
  openapi: "3.1.0",
  info: { title: "HormiGestión API", version: "0.2.0", description: "Configuración versionada, acceso, cotización y reportería con proyección de volumen cotizado. Aprobación comercial no confirma agenda; logística y calidad están pendientes. La proyección es estadística y aún no incorpora despachos reales." },
  servers: [{ url: "/" }],
  paths: {
    "/health/live": { get: { summary: "Proceso activo", responses: { "200": jsonResponse("Activo") } } },
    "/health/ready": { get: { summary: "PostgreSQL y configuración disponibles", responses: { "200": jsonResponse("Listo"), "503": jsonResponse("No listo") } } },
    "/api/v1/catalogos": { get: { summary: "Catálogos activos y parámetros públicos del cotizador", responses: { "200": jsonResponse("Catálogos con versión y etiqueta demo"), ...errors } } },
    ...Object.fromEntries(["resistencias", "elementos", "zonas-flete", "servicios"].map((name) => [`/api/v1/catalogos/${name}`, { get: { summary: `Catálogo ${name}`, responses: { "200": jsonResponse("Catálogo con versión"), ...errors } } }])),
    "/api/v1/cotizaciones/calcular": { post: { summary: "Cálculo autoritativo; no persiste ni reserva", requestBody: request("CalculationInput"), responses: { "200": jsonResponse("Desglose decimal y versión aplicada"), ...errors } } },
    "/api/v1/cotizaciones": {
      post: { summary: "Registrar solicitud, comprobante y evento en una transacción", parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" }, description: "UUID v4 aleatorio. Reutilizar únicamente al reintentar exactamente la misma solicitud." }], requestBody: request("CreateQuotationInput"), responses: { "201": jsonResponse("Creada: cotizacion, tokenComprobante y replayed=false"), "200": jsonResponse("Reintento: cotizacion original y replayed=true"), ...errors } },
      get: { summary: "Listado privado; administrador/despachador", security: staff, parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, { name: "offset", in: "query", schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 } }], responses: { "200": jsonResponse("Página de cotizaciones"), ...errors } },
    },
    "/api/v1/cotizaciones/{id}/comprobante": { get: { summary: "Comprobante propio con token limitado, o personal autorizado", security: receipt, parameters: [idParameter], responses: { "200": jsonResponse("Cotización histórica y estado vigente"), "404": jsonResponse("No encontrada", "Error"), ...errors } } },
    "/api/v1/cotizaciones/{id}/pdf": { get: { summary: "PDF con el mismo desglose persistido", security: receipt, parameters: [idParameter], responses: { "200": { description: "PDF de cotización; no es factura ni reserva", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, ...errors } } },
    ...Object.fromEntries(["contactar", "aprobar", "rechazar"].map((action) => [`/api/v1/cotizaciones/{id}/${action}`, { post: { summary: `${action}: administrador/despachador; transición auditada`, security: staff, parameters: [idParameter], requestBody: request("StateInput"), responses: { "200": jsonResponse("Estado actualizado o acción ya aplicada"), ...errors } } }])),
    "/api/v1/auth/login": { post: { summary: "Autenticar; el servidor obtiene el rol", requestBody: request("LoginInput"), responses: { "200": jsonResponse("JWT Bearer de 900 segundos y usuario"), ...errors } } },
    "/api/v1/auth/me": { get: { summary: "Identidad y rol actuales; verifica usuario activo", security: staff, responses: { "200": jsonResponse("Usuario autenticado"), ...errors } } },
    "/api/v1/usuarios": {
      get: { summary: "Personal: solo administrador", security: staff, responses: { "200": jsonResponse("Personal sin hashes"), ...errors } },
      post: { summary: "Crear personal: solo administrador", security: staff, requestBody: request("NewUserInput"), responses: { "201": jsonResponse("Usuario creado"), ...errors } },
    },
    "/api/v1/usuarios/{id}": { patch: { summary: "Editar/desactivar personal; conserva último administrador activo", security: staff, parameters: [idParameter], requestBody: request("UserChangesInput"), responses: { "200": jsonResponse("Usuario actualizado"), ...errors } } },
    "/api/v1/admin/configuracion": {
      get: { summary: "Configuración completa y versión: solo administrador", security: staff, responses: { "200": jsonResponse("Version, configuracion, creadoEn y motivo"), ...errors } },
      put: { summary: "Nueva versión completa; requiere versionEsperada y motivo", security: staff, requestBody: request("UpdateConfigurationInput"), responses: { "200": jsonResponse("Nueva versión aplicada atómicamente"), ...errors } },
    },
    "/api/v1/admin/configuracion/historial": { get: { summary: "Últimas 100 revisiones: solo administrador", security: staff, responses: { "200": jsonResponse("Versiones, motivos y autores"), ...errors } } },
    "/api/v1/mixers": { get: { summary: "Capacidades y estado administrativo: administrador/despachador; agenda pendiente", security: staff, responses: { "200": jsonResponse("Mixers con versión"), ...errors } } },
    ...Object.fromEntries(["/api/v1/admin/reportes", "/api/v1/admin/reportes/exportar.csv"].map((path) => [path, { get: {
      summary: path.endsWith(".csv") ? "Exportar agregados de cotización en CSV; solo administrador" : "Indicadores, demanda, proyección estadística y pulso semanal; solo administrador",
      security: staff, parameters: [
        { name: "desde", in: "query", schema: { type: "string", format: "date" }, description: "Fecha local inicial; rango máximo 366 días." },
        { name: "hasta", in: "query", schema: { type: "string", format: "date" }, description: "Fecha local final inclusiva; por defecto hoy." },
        { name: "origen", in: "query", schema: { type: "string", enum: ["DEMO", "REAL"] }, description: "Orígenes separados; por defecto el origen de la configuración vigente." },
        { name: "resistencia", in: "query", schema: { type: "string" } }, { name: "zona", in: "query", schema: { type: "string" } },
      ], responses: { "200": path.endsWith(".csv") ? { description: "CSV UTF-8, separador punto y coma; sin datos de clientes", content: { "text/csv": { schema: { type: "string" } } } } : jsonResponse("Indicadores, demanda, proyección, alerta, opciones y metodología; importes y volúmenes como texto decimal"), ...errors },
    } }])),
  },
  components: {
    securitySchemes: { staffBearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" }, receiptBearer: { type: "http", scheme: "bearer", description: "Token opaco devuelto al crear la solicitud. Limitado a su comprobante y con fecha de expiración." } },
    schemas: { ReportFilters: schema(reportFiltersSchema), Configuration: schema(configurationSchema), UpdateConfigurationInput: schema(updateConfigurationSchema), CalculationInput: schema(calculationSchema), CreateQuotationInput: schema(createQuotationSchema), LoginInput: schema(loginSchema), NewUserInput: schema(newUserSchema), UserChangesInput: schema(userChangesSchema), StateInput: schema(stateInput),
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object", required: ["codigo", "mensaje", "requestId"],
            properties: {
              codigo: { type: "string" }, mensaje: { type: "string" }, requestId: { type: "string", format: "uuid" },
              campos: { type: "array", items: { type: "object", properties: { campo: { type: "string" }, mensaje: { type: "string" } } } },
            },
          },
        },
      },
    },
  },
};
