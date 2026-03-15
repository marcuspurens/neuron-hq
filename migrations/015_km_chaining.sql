-- Migration 015: Add chaining support to km_runs
ALTER TABLE km_runs ADD COLUMN IF NOT EXISTS chain_id UUID;
ALTER TABLE km_runs ADD COLUMN IF NOT EXISTS cycle_number INTEGER DEFAULT 1;
ALTER TABLE km_runs ADD COLUMN IF NOT EXISTS stopped_by TEXT;

CREATE INDEX IF NOT EXISTS idx_km_runs_chain_id ON km_runs (chain_id);
