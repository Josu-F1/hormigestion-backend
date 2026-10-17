import { pathToFileURL } from "node:url";
import { demoConfiguration } from "../src/domain/demo.js";
import { loadEnv } from "../src/infrastructure/env.js";
import { createPool, transaction } from "../src/infrastructure/database/pool.js";
import { audit, writeCatalogs } from "../src/infrastructure/database/store.js";

async function main() {
  const env = loadEnv();
  const pool = createPool(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, 1);
  try {
    await transaction(pool, async (client) => {
      const admin = await client.query<{ id: string }>("SELECT id FROM usuarios WHERE rol_codigo='ADMINISTRADOR' LIMIT 1");
      const adminId = admin.rows[0]?.id ?? null;

      const res = await client.query<{ version: number }>(
        "INSERT INTO configuracion_versiones(contenido,motivo,autor_id) VALUES($1,$2,$3) RETURNING version",
        [JSON.stringify(demoConfiguration), "Catálogo técnico y comercial enriquecido - Hormigonera Tungurahua (Salasaca)", adminId]
      );
      const newVersion = res.rows[0]!.version;

      await writeCatalogs(client, demoConfiguration, newVersion);
      await client.query("UPDATE configuracion_actual SET version=$1 WHERE id=1", [newVersion]);
      await audit(client, { id: adminId ?? "00000000-0000-0000-0000-000000000000", email: "admin@demo.hormigestion.test", nombre: "Hormigonera Ltda", rol: "ADMINISTRADOR" }, "CONFIGURACION_ACTUALIZADA", "configuracion", { version: newVersion });

      console.log(`Configuración actualizada con éxito a versión ${newVersion} con los nuevos datos técnicos y comerciales.`);
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error al actualizar catálogo:", err);
  process.exit(1);
});
