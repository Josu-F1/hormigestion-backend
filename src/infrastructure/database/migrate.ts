import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadEnv } from "../env.js";
import { createPool } from "./pool.js";
import type { Pool } from "pg";

export async function migrate(pool: Pool, appPassword?: string) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('hormigestion:migrations'))");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (nombre text PRIMARY KEY, sha256 text NOT NULL, aplicada_en timestamptz NOT NULL DEFAULT now())");
    const directory = new URL("./migrations/", import.meta.url);
    const filenames = (await readdir(directory)).filter((name) => /^\d+_[a-z_]+\.sql$/.test(name)).sort();
    for (const filename of filenames) {
      const sql = await readFile(new URL(filename, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query<{ sha256: string }>("SELECT sha256 FROM schema_migrations WHERE nombre=$1", [filename]);
      if (previous.rows[0]) {
        if (previous.rows[0].sha256 !== checksum) throw new Error(`Migración aplicada modificada: ${filename}. Cree una migración nueva.`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(nombre,sha256) VALUES($1,$2)", [filename, checksum]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    if (appPassword) {
      if (appPassword.length < 24 || appPassword.includes("REEMPLAZAR")) throw new Error("APP_DB_PASSWORD requiere un secreto propio de al menos 24 caracteres");
      const found = await client.query("SELECT 1 FROM pg_roles WHERE rolname='hormigestion_app'");
      const statement = found.rowCount ? "ALTER ROLE hormigestion_app LOGIN PASSWORD %L" : "CREATE ROLE hormigestion_app LOGIN PASSWORD %L";
      const formatted = await client.query<{ sql: string }>("SELECT format($1, $2::text) AS sql", [statement, appPassword]);
      await client.query(formatted.rows[0]!.sql);
      await client.query(`
        REVOKE ALL ON SCHEMA public FROM PUBLIC;
        GRANT USAGE ON SCHEMA public TO hormigestion_app;
        GRANT SELECT ON roles TO hormigestion_app;
        GRANT SELECT,INSERT,UPDATE ON usuarios,configuracion_actual,resistencias,elementos_constructivos,zonas_flete,camiones_mixer,clientes,cotizaciones,conductores,despachos TO hormigestion_app;
        GRANT SELECT,INSERT ON configuracion_versiones,detalles_cotizacion,auditoria_eventos TO hormigestion_app;
        GRANT SELECT,INSERT,UPDATE ON eventos_salida TO hormigestion_app;
        GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO hormigestion_app;
      `);
    }
    return filenames;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('hormigestion:migrations'))").catch(() => undefined);
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadEnv();
  const pool = createPool(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, 1);
  try { await migrate(pool, env.APP_DB_PASSWORD); console.log("Migraciones verificadas y aplicadas; datos existentes conservados."); }
  catch (error) { console.error(error instanceof Error ? error.message : "Error de migración"); process.exitCode = 1; }
  finally { await pool.end(); }
}
