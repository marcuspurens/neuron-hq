CREATE TABLE IF NOT EXISTS km_runs (
  id SERIAL PRIMARY KEY,
  run_id TEXT,
  run_number INTEGER,
  trigger TEXT NOT NULL,
  topic TEXT,
  gaps_found INTEGER NOT NULL DEFAULT 0,
  gaps_researched INTEGER NOT NULL DEFAULT 0,
  gaps_resolved INTEGER NOT NULL DEFAULT 0,
  urls_ingested INTEGER NOT NULL DEFAULT 0,
  facts_learned INTEGER NOT NULL DEFAULT 0,
  sources_refreshed INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_km_runs_created ON km_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_km_runs_run_id ON km_runs (run_id);
