import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const [owner, app, jwt, receipt, demo] = Array.from({ length: 5 }, () => randomBytes(24).toString("hex"));
const content = `NODE_ENV=development
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173,http://localhost:8443
POSTGRES_DB=hormigestion
POSTGRES_USER=hormigestion_owner
POSTGRES_PASSWORD=${owner}
POSTGRES_PORT=55432
APP_DB_PASSWORD=${app}
MIGRATION_DATABASE_URL=postgresql://hormigestion_owner:${owner}@127.0.0.1:55432/hormigestion
DATABASE_URL=postgresql://hormigestion_app:${app}@127.0.0.1:55432/hormigestion
JWT_SECRET=${jwt}
COMPROBANTE_SECRET=${receipt}
DEMO_MODE=true
DEMO_PASSWORD=${demo}
DB_POOL_MAX=10
`;
try {
  await writeFile(".env", content, { flag: "wx", mode: 0o600 });
  console.log(".env local creado con secretos independientes. Clave de cuentas demo: valor DEMO_PASSWORD del archivo local.");
} catch (error) {
  if (error?.code === "EEXIST") console.log(".env ya existe; se conservó sin cambios.");
  else throw error;
}
