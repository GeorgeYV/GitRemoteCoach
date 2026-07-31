import { Pool, type PoolClient } from 'pg';
import { env } from '../config.js';

export let pool: Pool = new Pool({ connectionString: env.databaseUrl });

/** Solo para pruebas: reemplaza el pool (ej. por uno respaldado por pg-mem). */
export function setPoolForTesting(testPool: Pool): void {
  pool = testPool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
