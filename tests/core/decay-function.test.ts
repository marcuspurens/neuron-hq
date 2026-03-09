import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe('decay_confidence SQL migration', () => {
  it('migration file exists', async () => {
    const migrationPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../src/core/migrations/004_decay_function.sql',
    );
    const content = await fs.readFile(migrationPath, 'utf-8');
    expect(content).toContain('CREATE OR REPLACE FUNCTION decay_confidence');
  });

  it('validates table name against allowlist', async () => {
    const migrationPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../src/core/migrations/004_decay_function.sql',
    );
    const content = await fs.readFile(migrationPath, 'utf-8');
    expect(content).toContain("NOT IN ('kg_nodes', 'aurora_nodes')");
    expect(content).toContain('RAISE EXCEPTION');
  });

  it('returns statistics columns', async () => {
    const migrationPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../src/core/migrations/004_decay_function.sql',
    );
    const content = await fs.readFile(migrationPath, 'utf-8');
    expect(content).toContain('updated_count INTEGER');
    expect(content).toContain('avg_before REAL');
    expect(content).toContain('avg_after REAL');
  });

  it('only decays nodes with confidence > 0.01', async () => {
    const migrationPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../src/core/migrations/004_decay_function.sql',
    );
    const content = await fs.readFile(migrationPath, 'utf-8');
    expect(content).toContain('confidence > 0.01');
  });

  it('uses make_interval for inactive threshold', async () => {
    const migrationPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../src/core/migrations/004_decay_function.sql',
    );
    const content = await fs.readFile(migrationPath, 'utf-8');
    expect(content).toContain('make_interval');
  });

  it('uses format with %I for safe table interpolation', async () => {
    const migrationPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../src/core/migrations/004_decay_function.sql',
    );
    const content = await fs.readFile(migrationPath, 'utf-8');
    expect(content).toContain('%I');
  });
});
