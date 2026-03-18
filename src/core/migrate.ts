import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Run all pending migrations.
 * Reads .sql files from src/core/migrations/, checks which have been applied,
 * and runs new ones in alphabetical order.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get already applied migrations
    const { rows: applied } = await client.query(
      'SELECT name FROM migrations ORDER BY name',
    );
    const appliedNames = new Set(
      applied.map((r: { name: string }) => r.name),
    );

    // Read migration files
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const newMigrations: string[] = [];

    for (const file of files) {
      if (appliedNames.has(file)) continue;

      const sql = await fs.readFile(
        path.join(MIGRATIONS_DIR, file),
        'utf-8',
      );

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [
          file,
        ]);
        await client.query('COMMIT');
        newMigrations.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    return newMigrations;
  } finally {
    client.release();
  }
}

/**
 * Get list of migration files available on disk.
 */
export async function getMigrationFiles(): Promise<string[]> {
  try {
    const files = await fs.readdir(MIGRATIONS_DIR);
    return files.filter((f) => f.endsWith('.sql')).sort();
  } catch {  /* intentional: migrations dir may not exist */
    return [];
  }
}

/**
 * Get list of already applied migrations from the database.
 */
export async function getAppliedMigrations(pool: Pool): Promise<string[]> {
  try {
    const { rows } = await pool.query(
      'SELECT name FROM migrations ORDER BY name',
    );
    return rows.map((r: { name: string }) => r.name);
  } catch {  /* intentional: migrations table may not exist yet */
    return [];
  }
}
