import { Pool, PoolConfig } from 'pg';
import { getConfig } from './config.js';

let pool: Pool | null = null;

/**
 * Get or create the singleton Postgres connection pool.
 * Uses DATABASE_URL from centralized config or defaults to local Postgres.
 */
export function getPool(): Pool {
  if (!pool) {
    const cfg = getConfig();
    const config: PoolConfig = {
      connectionString:
        cfg.DATABASE_URL || 'postgresql://localhost:5432/neuron',
      max: cfg.DB_POOL_MAX,
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
  } catch (err) {
    console.warn('Warning: Database not available:', err);
    return false;
  }
}
