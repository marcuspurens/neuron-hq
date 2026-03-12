-- Bayesian confidence audit trail
CREATE TABLE IF NOT EXISTS confidence_audit (
  id SERIAL PRIMARY KEY,
  node_id TEXT NOT NULL,
  old_confidence REAL NOT NULL,
  new_confidence REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('supports', 'contradicts')),
  source_type TEXT NOT NULL,
  weight REAL NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confidence_audit_node_id
  ON confidence_audit(node_id);
CREATE INDEX IF NOT EXISTS idx_confidence_audit_timestamp
  ON confidence_audit(timestamp DESC);
