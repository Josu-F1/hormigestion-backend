import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import { demoConfiguration } from "../../domain/demo.js";
import { loadEnv } from "../env.js";
import { createPool, transaction } from "./pool.js";
import { audit, writeCatalogs } from "./store.js";

export async function seedDemo(pool: Pool, password: string) {
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72 || password.includes("REEMPLAZAR")) throw new Error("Defina DEMO_PASSWORD entre 12 y 72 bytes");
  const passwordHash = await bcrypt.hash(password, 12);
  return transaction(pool, async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hormigestion:seed-demo'))");
    const existing = await client.query("SELECT 1 FROM configuracion_actual WHERE id=1");
    if (existing.rowCount) return false;
    const occupied = await client.query("SELECT 1 FROM usuarios LIMIT 1");
    if (occupied.rowCount) throw new Error("La base contiene personal sin configuración; inicialícela de forma explícita");
    const demoUsers = [
      ["admin", "Administrador DEMO", "ADMINISTRADOR"], ["despacho", "Despachador DEMO", "DESPACHADOR"],
      ["calidad", "Laboratorista DEMO", "LABORATORISTA"], ["conductor", "Conductor DEMO", "CONDUCTOR"],
    ];
    let adminId = "";
    for (const [name, displayName, role] of demoUsers) {
      const id = randomUUID();
      if (role === "ADMINISTRADOR") adminId = id;
      await client.query("INSERT INTO usuarios(id,email,nombre,password_hash,rol_codigo,datos_demostracion) VALUES($1,$2,$3,$4,$5,true)", [id, `${name}@demo.hormigestion.test`, displayName, passwordHash, role]);
      if (role === "CONDUCTOR") {
        await client.query("UPDATE conductores SET usuario_id=$1 WHERE id='50000000-0000-0000-0000-000000000002'", [id]);
      }
    }
    const version = await client.query<{ version: number }>("INSERT INTO configuracion_versiones(contenido,motivo,autor_id) VALUES($1,$2,$3) RETURNING version", [JSON.stringify(demoConfiguration), "Datos ficticios autorizados para desarrollo del proyecto", adminId]);
    await writeCatalogs(client, demoConfiguration, version.rows[0]!.version);
    await client.query("INSERT INTO configuracion_actual(id,version) VALUES(1,$1)", [version.rows[0]!.version]);
    await audit(client, { id: adminId, email: "admin@demo.hormigestion.test", nombre: "Administrador DEMO", rol: "ADMINISTRADOR" }, "DEMO_INICIALIZADA", "configuracion", { version: version.rows[0]!.version, datosDemostracion: true });
    return true;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = loadEnv();
  if (!env.DEMO_MODE || env.NODE_ENV === "production" || !env.DEMO_PASSWORD) throw new Error("Semillas demo requieren DEMO_MODE=true, entorno de desarrollo/pruebas y DEMO_PASSWORD");
  const pool = createPool(env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL, 1);
  try { console.log(await seedDemo(pool, env.DEMO_PASSWORD) ? "Configuración y cuatro cuentas DEMO creadas. Clave en .env local." : "La configuración ya existe; no se sobrescribió ningún dato ni contraseña."); }
  catch (error) { console.error(error instanceof Error ? error.message : "Error de inicialización"); process.exitCode = 1; }
  finally { await pool.end(); }
}
