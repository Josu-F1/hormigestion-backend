import { Pool, type PoolClient } from "pg";

export function createPool(connectionString: string, max = 10) {
  return new Pool({ connectionString, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000, idle_in_transaction_session_timeout: 10000 });
}

export async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>, isolation: "READ COMMITTED" | "REPEATABLE READ" = "READ COMMITTED") {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
