import "dotenv/config";
import { z } from "zod";

const secret = z.string().min(32).refine((value) => !value.includes("REEMPLAZAR"), "Genere un secreto propio");
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000), HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.url(), MIGRATION_DATABASE_URL: z.url().optional(), APP_DB_PASSWORD: z.string().optional(),
  JWT_SECRET: secret, COMPROBANTE_SECRET: secret,
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  DEMO_MODE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEMO_PASSWORD: z.string().min(12).max(72).optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
}).superRefine((value, ctx) => {
  if (value.JWT_SECRET === value.COMPROBANTE_SECRET) ctx.addIssue({ code: "custom", path: ["COMPROBANTE_SECRET"], message: "Use secretos independientes" });
  if (value.NODE_ENV === "production" && value.DEMO_MODE) ctx.addIssue({ code: "custom", path: ["DEMO_MODE"], message: "El modo demo está restringido a desarrollo/pruebas" });
  if (value.NODE_ENV === "production" && value.CORS_ORIGINS.split(",").some((origin) => !origin.trim().startsWith("https://"))) ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "Producción requiere orígenes HTTPS explícitos" });
});
export const loadEnv = (source: NodeJS.ProcessEnv = process.env) => envSchema.parse(source);
export type Env = z.infer<typeof envSchema>;
