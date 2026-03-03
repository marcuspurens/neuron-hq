import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('migrate module', () => {
  it('getMigrationFiles returns available SQL files', async () => {
    const { getMigrationFiles } = await import('../../src/core/migrate.js');
    const files = await getMigrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files[0]).toBe('001_initial.sql');
    expect(files.every((f) => f.endsWith('.sql'))).toBe(true);
  });

  it('migration files are sorted alphabetically', async () => {
    const { getMigrationFiles } = await import('../../src/core/migrate.js');
    const files = await getMigrationFiles();
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  it('001_initial.sql contains all required tables', async () => {
    const sqlPath = path.resolve(__dirname, '../../src/core/migrations/001_initial.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    const requiredTables = [
      'kg_nodes',
      'kg_edges',
      'runs',
      'usage',
      'metrics',
      'audit_entries',
      'task_scores',
      'migrations',
    ];

    for (const table of requiredTables) {
      expect(sql).toContain(table);
    }
  });

  it('001_initial.sql uses IF NOT EXISTS for tables', async () => {
    const sqlPath = path.resolve(__dirname, '../../src/core/migrations/001_initial.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    const createTableMatches = sql.match(/CREATE TABLE/g) ?? [];
    const ifNotExistsMatches = sql.match(/CREATE TABLE IF NOT EXISTS/g) ?? [];

    expect(createTableMatches.length).toBeGreaterThan(0);
    expect(ifNotExistsMatches.length).toBe(createTableMatches.length);
  });

  it('001_initial.sql has proper CHECK constraints for node types', async () => {
    const sqlPath = path.resolve(__dirname, '../../src/core/migrations/001_initial.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    expect(sql).toContain("'pattern'");
    expect(sql).toContain("'error'");
    expect(sql).toContain("'technique'");
    expect(sql).toContain("'run'");
    expect(sql).toContain("'agent'");
  });

  it('001_initial.sql has proper CHECK constraints for edge types', async () => {
    const sqlPath = path.resolve(__dirname, '../../src/core/migrations/001_initial.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    expect(sql).toContain("'solves'");
    expect(sql).toContain("'discovered_in'");
    expect(sql).toContain("'related_to'");
    expect(sql).toContain("'causes'");
    expect(sql).toContain("'used_by'");
  });

  it('001_initial.sql has indexes on key columns', async () => {
    const sqlPath = path.resolve(__dirname, '../../src/core/migrations/001_initial.sql');
    const sql = await fs.readFile(sqlPath, 'utf-8');

    const expectedIndexes = [
      'idx_kg_nodes_type',
      'idx_kg_nodes_scope',
      'idx_kg_nodes_confidence',
      'idx_kg_edges_from',
      'idx_kg_edges_to',
      'idx_kg_edges_type',
      'idx_runs_target',
      'idx_runs_status',
      'idx_runs_started',
      'idx_audit_runid',
      'idx_audit_ts',
      'idx_audit_role',
      'idx_audit_tool',
      'idx_task_scores_runid',
    ];

    for (const idx of expectedIndexes) {
      expect(sql).toContain(idx);
    }
  });

  it('runMigrations function is exported', async () => {
    const { runMigrations } = await import('../../src/core/migrate.js');
    expect(runMigrations).toBeDefined();
    expect(typeof runMigrations).toBe('function');
  });
});
