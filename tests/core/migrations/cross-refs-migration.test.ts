import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../src/core/migrations/005_cross_refs.sql',
);

describe('Migration 005: cross_refs table', () => {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');

  it('creates cross_refs table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS cross_refs');
  });

  it('has correct columns', () => {
    expect(sql).toContain('neuron_node_id TEXT NOT NULL');
    expect(sql).toContain('aurora_node_id TEXT NOT NULL');
    expect(sql).toContain('relationship TEXT NOT NULL');
    expect(sql).toContain('similarity REAL');
    expect(sql).toContain('metadata JSONB');
    expect(sql).toContain('created_at TIMESTAMPTZ');
  });

  it('has foreign key references', () => {
    expect(sql).toContain('REFERENCES kg_nodes(id)');
    expect(sql).toContain('REFERENCES aurora_nodes(id)');
  });

  it('has CHECK constraint for relationship values', () => {
    expect(sql).toContain("'supports'");
    expect(sql).toContain("'contradicts'");
    expect(sql).toContain("'enriches'");
    expect(sql).toContain("'discovered_via'");
  });

  it('has UNIQUE constraint', () => {
    expect(sql).toContain('UNIQUE(neuron_node_id, aurora_node_id, relationship)');
  });

  it('creates indexes', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_cross_refs_neuron');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_cross_refs_aurora');
  });
});
