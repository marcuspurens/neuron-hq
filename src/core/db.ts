import { Pool, PoolConfig } from 'pg';

let pool: Pool | null = null;

/**
 * Get or create the singleton Postgres connection pool.
 * Uses DATABASE_URL env var or defaults to local Postgres.
 */
export function getPool(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      connectionString:
        process.env.DATABASE_URL || 'postgresql://localhost:5432/neuron',
      max: 5,
    };
    pool = new Pool(config);
  }
  return pool;
}

/**
 * Close the connection pool and release all clients.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Check whether the database is reachable.
 * Returns true if a connection can be established, false otherwise.
 */
export async function isDbAvailable(): Promise<boolean> {
  try {
    const p = getPool();
    const client = await p.connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}
