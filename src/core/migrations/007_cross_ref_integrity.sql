-- Migration 007: Cross-ref integrity — context and strength columns

ALTER TABLE cross_refs
  ADD COLUMN IF NOT EXISTS context TEXT,
  ADD COLUMN IF NOT EXISTS strength REAL;

-- Populate strength from existing similarity for existing rows
UPDATE cross_refs SET strength = similarity WHERE strength IS NULL AND similarity IS NOT NULL;

COMMENT ON COLUMN cross_refs.context IS 'Why this cross-ref exists (auto-generated or manual)';
COMMENT ON COLUMN cross_refs.strength IS 'Connection strength 0-1 (may differ from initial similarity)';
