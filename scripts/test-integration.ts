import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { loadEnv } from "../src/infrastructure/env.js";
import { createPool } from "../src/infrastructure/database/pool.js";

const env = loadEnv();
if (!env.MIGRATION_DATABASE_URL || !env.APP_DB_PASSWORD) throw new Error("Pruebas integradas requieren MIGRATION_DATABASE_URL y APP_DB_PASSWORD para crear una base temporal aislada");
const name = `hormigestion_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const owner = new URL(env.MIGRATION_DATABASE_URL);
const maintenance = new URL(owner); maintenance.pathname = "/postgres";
const admin = createPool(maintenance.toString(), 1);
let created = false;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  owner.pathname = `/${name}`;
  const app = new URL(owner); app.username = "hormigestion_app"; app.password = env.APP_DB_PASSWORD;
  console.log("Pruebas contra PostgreSQL real en base temporal aislada; datos de desarrollo conservados.");
  const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-isolation=none", "tests/integration/api.test.ts"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", TEST_DATABASE_URL: owner.toString(), TEST_APP_DATABASE_URL: app.toString(), APP_DB_PASSWORD: env.APP_DB_PASSWORD },
  });
  process.exitCode = await new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1)); });
} finally {
  if (created) {
    await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [name]);
    await admin.query(`DROP DATABASE "${name}"`);
  }
  await admin.end();
}
