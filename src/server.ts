import pino from "pino";
import { createApp } from "./app.js";
import { loadEnv } from "./infrastructure/env.js";
import { createPool } from "./infrastructure/database/pool.js";

const env = loadEnv();
const logger = pino({ level: env.LOG_LEVEL });
const pool = createPool(env.DATABASE_URL, env.DB_POOL_MAX);
pool.on("error", () => logger.error("Conexión inactiva de PostgreSQL interrumpida"));
const app = createApp(pool, env, { logger });
const server = app.listen(env.PORT, env.HOST, () => logger.info({ port: env.PORT, host: env.HOST, demo: env.DEMO_MODE }, "HormiGestión iniciado"));
server.on("error", (error) => { logger.error({ code: (error as NodeJS.ErrnoException).code }, "No se pudo iniciar el servidor"); void pool.end(); process.exitCode = 1; });
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "Cerrando servidor y conexiones");
  const timeout = setTimeout(() => { logger.error("Tiempo de cierre agotado"); process.exit(1); }, 10000).unref();
  server.close(() => { void pool.end().then(() => { clearTimeout(timeout); }).catch(() => { process.exitCode = 1; }); });
  server.closeIdleConnections();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
