import { randomUUID } from "node:crypto";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pino, { type Logger } from "pino";
import { z } from "zod";
import type { Pool } from "pg";
import { AuthService, ConfigurationService, QuotationService, loginSchema, newUserSchema, userChangesSchema, requireRole } from "./application/services.js";
import { updateConfigurationSchema, type Actor } from "./domain/configuracion.js";
import { calculationSchema, createQuotationSchema } from "./domain/cotizacion.js";
import { AppError } from "./domain/errors.js";
import { PgStore } from "./infrastructure/database/store.js";
import type { Env } from "./infrastructure/env.js";
import { quotationPdf } from "./infrastructure/pdf.js";
import { openApi } from "./infrastructure/openapi.js";
import { ReportService } from "./application/report-service.js";
import { PgReportStore } from "./infrastructure/database/report-store.js";
import { reportFiltersSchema } from "./domain/reporteria.js";
import { DespachoService } from "./application/despacho-service.js";
import { PgDespachoStore } from "./infrastructure/database/despacho-store.js";
import { asignarMixerSchema } from "./domain/despacho.js";

const uuid = z.uuid();
const changeStateSchema = z.strictObject({ versionEsperada: z.int().positive(), motivo: z.string().trim().min(5).max(500) });
const paginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0) });
const quoteQuerySchema = paginationSchema.extend({ estado: z.enum(["PENDIENTE", "CONTACTADA", "APROBADA", "RECHAZADA", "VENCIDA"]).optional(), q: z.string().trim().max(100).optional() });
const keySchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "Idempotency-Key debe ser un UUID v4 nuevo para cada solicitud");

function bearer(req: Request) {
  const value = req.headers.authorization;
  const match = value && value.length <= 4096 ? /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value) : null;
  if (!match?.[1]) throw new AppError(401, "AUTENTICACION_REQUERIDA", "Envíe un token Bearer válido");
  return match[1];
}
const actorFrom = (res: Response) => res.locals.actor as Actor;

export function createApp(pool: Pool, env: Env, options: { logger?: Logger; clock?: () => Date; rateLimits?: boolean } = {}) {
  const logger = options.logger ?? pino({ level: env.LOG_LEVEL, redact: ["password", "passwordHash", "token", "authorization"] });
  const repository = new PgStore(pool);
  const auth = new AuthService(repository, env.JWT_SECRET);
  const settings = new ConfigurationService(repository);
  const quotes = new QuotationService(repository, repository, auth, env.COMPROBANTE_SECRET, options.clock);
  const reports = new ReportService(new PgReportStore(pool), options.clock);
  const despachos = new DespachoService(new PgDespachoStore(pool), options.clock);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((req, res, next) => {
    res.locals.requestId = randomUUID();
    res.set("X-Request-Id", res.locals.requestId).set("Cache-Control", "no-store");
    const started = Date.now();
    res.on("finish", () => logger.info({ requestId: res.locals.requestId, method: req.method, route: req.route?.path ?? req.path, status: res.statusCode, durationMs: Date.now() - started }, "http"));
    next();
  });
  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, callback) => !origin || origins.includes(origin) ? callback(null, true) : callback(new AppError(403, "ORIGEN_NO_PERMITIDO", "Origen no permitido")),
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"], exposedHeaders: ["X-Request-Id", "ETag"],
  }));
  app.use(express.json({ limit: "256kb" }));
  const tooMany = (req: Request, res: Response) => res.status(429).json({ error: { codigo: "LIMITE_SOLICITUDES", mensaje: "Demasiadas solicitudes; vuelva a intentar más tarde", requestId: res.locals.requestId } });
  if (options.rateLimits !== false) {
    app.use("/api/v1", rateLimit({ windowMs: 15 * 60000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false, handler: tooMany }));
    app.use("/api/v1/auth/login", rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, handler: tooMany }));
  }
  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    try { await settings.current(); res.json({ status: "ready" }); }
    catch { res.status(503).json({ status: "not_ready" }); }
  });
  app.get("/api/v1/openapi.json", (_req, res) => res.json(openApi));
  app.get("/api/v1/catalogos", async (_req, res) => {
    const current = await settings.current();
    const config = current.configuracion;
    res.set("ETag", `"config-${current.version}"`).json({ versionConfiguracion: current.version, datosDemostracion: config.datosDemostracion,
      planta: { nombre: config.planta.nombre, canton: config.planta.canton, zonaHoraria: config.planta.zonaHoraria },
      comercial: config.comercial, resistencias: config.resistencias.filter((item) => item.activo), elementos: config.elementos.filter((item) => item.activo), zonasFlete: config.zonasFlete.filter((item) => item.activo) });
  });
  for (const [route, key] of [["resistencias", "resistencias"], ["elementos", "elementos"], ["zonas-flete", "zonasFlete"]] as const) {
    app.get(`/api/v1/catalogos/${route}`, async (_req, res) => {
      const current = await settings.current();
      res.json({ versionConfiguracion: current.version, datosDemostracion: current.configuracion.datosDemostracion, data: current.configuracion[key].filter((item) => item.activo) });
    });
  }
  app.get("/api/v1/catalogos/servicios", async (_req, res) => {
    const current = await settings.current();
    res.json({ versionConfiguracion: current.version, datosDemostracion: current.configuracion.datosDemostracion, bombeo: current.configuracion.comercial.bombeo, flete: current.configuracion.comercial.flete });
  });
  app.post("/api/v1/cotizaciones/calcular", async (req, res) => res.json(await quotes.calculate(calculationSchema.parse(req.body))));
  app.post("/api/v1/cotizaciones", async (req, res) => {
    const key = keySchema.parse(req.headers["idempotency-key"]);
    const result = await quotes.create(createQuotationSchema.parse(req.body), key);
    res.status(result.replayed ? 200 : 201).json(result);
  });
  app.get("/api/v1/cotizaciones/:id/comprobante", async (req, res) => res.json(await quotes.receipt(uuid.parse(req.params.id), bearer(req))));
  app.get("/api/v1/cotizaciones/:id/pdf", async (req, res) => {
    const quote = await quotes.receipt(uuid.parse(req.params.id), bearer(req));
    res.set("Content-Type", "application/pdf").set("Content-Disposition", `attachment; filename="${quote.codigo}.pdf"`).send(await quotationPdf(quote));
  });
  app.post("/api/v1/auth/login", async (req, res) => res.json(await auth.login(loginSchema.parse(req.body))));
  const privateApi = express.Router();
  privateApi.use(async (req, res, next) => { res.locals.actor = await auth.authenticate(bearer(req)); next(); });
  privateApi.get("/auth/me", (_req, res) => res.json({ usuario: actorFrom(res) }));
  privateApi.get("/admin/reportes", async (req, res) => res.json(await reports.report(reportFiltersSchema.parse(req.query), actorFrom(res))));
  privateApi.get("/admin/reportes/exportar.csv", async (req, res) => {
    const result = await reports.csv(reportFiltersSchema.parse(req.query), actorFrom(res));
    res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="${result.filename}"`).send(result.content);
  });
  privateApi.get("/usuarios", async (_req, res) => res.json({ data: await auth.users(actorFrom(res)) }));
  privateApi.post("/usuarios", async (req, res) => res.status(201).json(await auth.createUser(newUserSchema.parse(req.body), actorFrom(res), (await settings.current()).configuracion.datosDemostracion)));
  privateApi.patch("/usuarios/:id", async (req, res) => res.json(await auth.updateUser(uuid.parse(req.params.id), userChangesSchema.parse(req.body), actorFrom(res))));
  privateApi.get("/admin/configuracion", async (_req, res) => { requireRole(actorFrom(res), ["ADMINISTRADOR"]); res.json(await settings.current()); });
  privateApi.get("/admin/configuracion/historial", async (_req, res) => res.json({ data: await settings.history(actorFrom(res)) }));
  privateApi.put("/admin/configuracion", async (req, res) => {
    const input = updateConfigurationSchema.parse(req.body);
    res.json(await settings.update(input.configuracion, input.versionEsperada, input.motivo, actorFrom(res)));
  });
  privateApi.get("/mixers", async (_req, res) => { requireRole(actorFrom(res), ["ADMINISTRADOR", "DESPACHADOR"]); const current = await settings.current(); res.json({ versionConfiguracion: current.version, data: current.configuracion.mixers }); });
  privateApi.get("/conductores", async (_req, res) => { res.json({ data: await despachos.conductoresDisponibles(actorFrom(res)) }); });
  privateApi.get("/conductor/despacho", async (_req, res) => {
    res.json({ data: await despachos.despachoDelConductor(actorFrom(res)) });
  });

  // ── Módulo Despachos (Control en el Mixer) ──────────────────────────
  privateApi.post("/despachos/asignar", async (req, res) => {
    const input = asignarMixerSchema.parse(req.body);
    res.status(201).json(await despachos.asignarMixerViaje(input, actorFrom(res)));
  });
  privateApi.post("/despachos/:id/iniciar-transito", async (req, res) => {
    res.json(await despachos.iniciarTransito(uuid.parse(req.params.id), actorFrom(res)));
  });
  privateApi.post("/despachos/:id/iniciar-por-conductor", async (req, res) => {
    res.json(await despachos.iniciarTransitoComoConductor(uuid.parse(req.params.id), actorFrom(res)));
  });
  privateApi.post("/despachos/:id/registrar-llegada", async (req, res) => {
    res.json(await despachos.registrarLlegadaComoConductor(uuid.parse(req.params.id), actorFrom(res)));
  });
  privateApi.post("/despachos/:id/registrar-retorno", async (req, res) => {
    res.json(await despachos.registrarRetornoComoConductor(uuid.parse(req.params.id), actorFrom(res)));
  });
  privateApi.get("/despachos/activos", async (_req, res) => {
    res.json({ data: await despachos.viajesActivos(actorFrom(res)) });
  });
  privateApi.get("/cotizaciones", async (req, res) => {
    const query = quoteQuerySchema.parse(req.query);
    const result = await quotes.list(actorFrom(res), query.limit, query.offset, { estado: query.estado, q: query.q });
    res.json({ limit: query.limit, offset: query.offset, total: result.total, data: result.data });
  });
  for (const [action, state] of [["contactar", "CONTACTADA"], ["aprobar", "APROBADA"], ["rechazar", "RECHAZADA"]] as const) {
    privateApi.post(`/cotizaciones/:id/${action}`, async (req, res) => {
      const input = changeStateSchema.parse(req.body);
      res.json(await quotes.changeState(uuid.parse(req.params.id), state, input.versionEsperada, input.motivo, actorFrom(res)));
    });
  }
  app.use("/api/v1", privateApi);
  app.use((_req, _res, next) => next(new AppError(404, "RUTA_NO_ENCONTRADA", "Ruta no encontrada")));
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent) { res.end(); return; }
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: { codigo: "VALIDACION", mensaje: "Revise los campos enviados", campos: error.issues.map((issue) => ({ campo: issue.path.join("."), mensaje: issue.message })), requestId: res.locals.requestId } }); return;
    }
    if (error instanceof AppError) {
      res.status(error.status).json({ error: { codigo: error.code, mensaje: error.message, requestId: res.locals.requestId } }); return;
    }
    const known = error && typeof error === "object" ? error as { code?: string; type?: string } : {};
    if (known.type === "entity.parse.failed" || known.type === "entity.too.large") {
      res.status(known.type === "entity.too.large" ? 413 : 400).json({ error: { codigo: "CUERPO_INVALIDO", mensaje: "Cuerpo JSON inválido o demasiado grande", requestId: res.locals.requestId } }); return;
    }
    if (known.code === "23505") { res.status(409).json({ error: { codigo: "REGISTRO_DUPLICADO", mensaje: "Ya existe un registro con esos datos únicos", requestId: res.locals.requestId } }); return; }
    if (["ECONNREFUSED", "57P01", "53300", "57014"].includes(known.code ?? "")) { res.status(503).json({ error: { codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "Servicio temporalmente no disponible", requestId: res.locals.requestId } }); return; }
    logger.error({ requestId: res.locals.requestId, errorName: error instanceof Error ? error.name : "Unknown", code: known.code }, "Error interno");
    res.status(500).json({ error: { codigo: "ERROR_INTERNO", mensaje: "No se pudo completar la operación", requestId: res.locals.requestId } });
  };
  app.use(handleError);
  return app;
}
