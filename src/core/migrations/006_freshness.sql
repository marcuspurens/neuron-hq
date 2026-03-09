-- Migration 006: Source freshness scoring
-- Add last_verified column to aurora_nodes for tracking source verification

ALTER TABLE aurora_nodes
  ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;

-- Index for freshness queries (finding unverified or stale nodes)
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_last_verified
  ON aurora_nodes (last_verified)
  WHERE last_verified IS NOT NULL;
