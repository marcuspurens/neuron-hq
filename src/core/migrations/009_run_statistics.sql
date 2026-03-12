-- Run statistics: Bayesian beliefs per dimension
CREATE TABLE IF NOT EXISTS run_beliefs (
  id SERIAL PRIMARY KEY,
  dimension TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  total_runs INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dimension)
);

CREATE TABLE IF NOT EXISTS run_belief_audit (
  id SERIAL PRIMARY KEY,
  dimension TEXT NOT NULL,
  runid TEXT NOT NULL,
  old_confidence REAL NOT NULL,
  new_confidence REAL NOT NULL,
  success BOOLEAN NOT NULL,
  weight REAL NOT NULL,
  evidence TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_beliefs_dimension ON run_beliefs(dimension);
CREATE INDEX IF NOT EXISTS idx_run_belief_audit_dimension ON run_belief_audit(dimension);
CREATE INDEX IF NOT EXISTS idx_run_belief_audit_runid ON run_belief_audit(runid);
