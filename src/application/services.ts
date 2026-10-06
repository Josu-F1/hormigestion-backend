import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { roles, type Actor, type Configuration } from "../domain/configuracion.js";
import { calculateQuotation, stateAt, type CalculationInput, type CreateQuotationInput, type Quotation, type QuotationState } from "../domain/cotizacion.js";
import { AppError } from "../domain/errors.js";
import type { ConfigurationRepository, UserRepository, QuotationRepository } from "../domain/repositories.js";

const password = z.string().min(12).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72, "La clave supera 72 bytes UTF-8");
export const loginSchema = z.strictObject({ email: z.email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, "utf8") <= 72) });
export const newUserSchema = z.strictObject({ email: z.email().max(254).transform((value) => value.toLowerCase()), nombre: z.string().trim().min(3).max(120), rol: z.enum(roles), password, activo: z.boolean().default(true) });
export const userChangesSchema = z.strictObject({ nombre: z.string().trim().min(3).max(120).optional(), rol: z.enum(roles).optional(), activo: z.boolean().optional(), password: password.optional() }).refine((value) => Object.keys(value).length > 0, "Incluya un cambio");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const requireRole = (actor: Actor, allowed: Actor["rol"][]) => {
  if (!allowed.includes(actor.rol)) throw new AppError(403, "PERMISO_DENEGADO", "No tiene permiso para esta operación");
};

export class AuthService {
  private readonly dummyHash = bcrypt.hashSync(randomUUID(), 12);
  constructor(private readonly repository: UserRepository, private readonly secret: string) {}

  async login(input: z.infer<typeof loginSchema>) {
    const user = await this.repository.findUserByEmail(input.email);
    const matches = await bcrypt.compare(input.password, user?.passwordHash ?? this.dummyHash);
    if (!user?.activo || !matches) throw new AppError(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña inválidos");
    const actor: Actor = { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol };
    return { accessToken: jwt.sign({}, this.secret, { algorithm: "HS256", subject: actor.id, issuer: "hormigestion", audience: "hormigestion-api", expiresIn: 900 }), tokenType: "Bearer", expiresIn: 900, usuario: actor };
  }
  async authenticate(token: string): Promise<Actor> {
    let subject: string;
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ["HS256"], issuer: "hormigestion", audience: "hormigestion-api" });
      if (typeof payload === "string" || !z.uuid().safeParse(payload.sub).success) throw new Error("subject inválido");
      subject = payload.sub!;
    } catch { throw new AppError(401, "SESION_INVALIDA", "Sesión inválida o vencida"); }
    const user = await this.repository.findUserById(subject);
    if (!user?.activo) throw new AppError(401, "SESION_INVALIDA", "Sesión inválida o vencida");
    return { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol };
  }
  async users(actor: Actor) { requireRole(actor, ["ADMINISTRADOR"]); return this.repository.users(); }
  async createUser(input: z.infer<typeof newUserSchema>, actor: Actor, demo: boolean) {
    requireRole(actor, ["ADMINISTRADOR"]);
    const { password: plainPassword, ...data } = input;
    return this.repository.createUser({ ...data, id: randomUUID(), passwordHash: await bcrypt.hash(plainPassword, 12), datosDemostracion: demo }, actor);
  }
  async updateUser(id: string, input: z.infer<typeof userChangesSchema>, actor: Actor) {
    requireRole(actor, ["ADMINISTRADOR"]);
    const { password: plainPassword, ...changes } = input;
    return this.repository.updateUser(id, { ...changes, ...(plainPassword ? { passwordHash: await bcrypt.hash(plainPassword, 12) } : {}) }, actor);
  }
}

export class ConfigurationService {
  constructor(private readonly repository: ConfigurationRepository) {}
  current() { return this.repository.current(); }
  async history(actor: Actor) { requireRole(actor, ["ADMINISTRADOR"]); return this.repository.history(); }
  async update(config: Configuration, expectedVersion: number, reason: string, actor: Actor) {
    requireRole(actor, ["ADMINISTRADOR"]);
    return this.repository.update(config, expectedVersion, reason, actor);
  }
}

export class QuotationService {
  constructor(private readonly quotes: QuotationRepository, private readonly configs: ConfigurationRepository,
    private readonly auth: AuthService, private readonly proofSecret: string, private readonly clock: () => Date = () => new Date()) {}

  private proof(id: string) { return createHmac("sha256", this.proofSecret).update(`hormigestion:comprobante:${id}`).digest("base64url"); }
  async calculate(input: CalculationInput) {
    const current = await this.configs.current();
    return calculateQuotation(input, current.configuracion, current.version);
  }
  async create(input: CreateQuotationInput, idempotencyKey: string) {
    const result = await this.quotes.createQuotation(hash(idempotencyKey), hash(JSON.stringify(input)), (current) => {
      if (input.versionConfiguracion !== current.version) throw new AppError(409, "RECALCULAR_COTIZACION", "Las condiciones cambiaron; calcule de nuevo antes de confirmar");
      const now = this.clock();
      const dateParts = new Intl.DateTimeFormat("en", { timeZone: current.configuracion.planta.zonaHoraria, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
      const part = (type: string) => dateParts.find((item) => item.type === type)!.value;
      const today = `${part("year")}-${part("month")}-${part("day")}`;
      if (input.obra.fechaPreferida < today) throw new AppError(422, "FECHA_PREFERIDA_PASADA", "La fecha preferida debe ser actual o futura");
      const id = randomUUID();
      const quote: Quotation = {
        id, codigo: `COT-${now.getUTCFullYear()}-${id.replaceAll("-", "").toUpperCase()}`,
        estado: "PENDIENTE", version: 1, creadoEn: now.toISOString(),
        validaHasta: new Date(now.getTime() + current.configuracion.comercial.vigenciaDias * 86400000).toISOString(),
        accesoExpiraEn: new Date(now.getTime() + current.configuracion.comercial.diasAccesoComprobante * 86400000).toISOString(),
        contacto: input.contacto, obra: input.obra, calculo: calculateQuotation(input, current.configuracion, current.version),
        politicaEntrega: { ...current.configuracion.calidad },
      };
      return { cotizacion: quote, tokenHash: hash(this.proof(id)) };
    });
    return { cotizacion: { ...result.cotizacion, estado: stateAt(result.cotizacion, this.clock()) }, tokenComprobante: this.proof(result.cotizacion.id), replayed: result.replayed };
  }
  async receipt(id: string, token: string) {
    const saved = await this.quotes.quotation(id);
    if (!saved) throw new AppError(404, "COTIZACION_NO_ENCONTRADA", "Cotización no encontrada");
    const tokenMatches = timingSafeEqual(Buffer.from(hash(token), "hex"), Buffer.from(saved.tokenHash, "hex"));
    if (!tokenMatches || new Date(saved.cotizacion.accesoExpiraEn).getTime() <= this.clock().getTime()) {
      const actor = await this.auth.authenticate(token);
      requireRole(actor, ["ADMINISTRADOR", "DESPACHADOR"]);
    }
    return { ...saved.cotizacion, estado: stateAt(saved.cotizacion, this.clock()) };
  }
  async list(actor: Actor, limit: number, offset: number, filters?: { estado?: QuotationState; q?: string }) {
    requireRole(actor, ["ADMINISTRADOR", "DESPACHADOR"]);
    const res = await this.quotes.quotations(limit, offset, filters);
    return { total: res.total, data: res.items.map((quote) => ({ ...quote, estado: stateAt(quote, this.clock()) })) };
  }
  async changeState(id: string, target: "CONTACTADA" | "APROBADA" | "RECHAZADA", expectedVersion: number, reason: string, actor: Actor) {
    requireRole(actor, ["ADMINISTRADOR", "DESPACHADOR"]);
    return this.quotes.changeQuotationState(id, target, expectedVersion, reason, actor, this.clock());
  }
}
