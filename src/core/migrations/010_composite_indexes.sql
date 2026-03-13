-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_kg_edges_from_type ON kg_edges (from_id, type);
CREATE INDEX IF NOT EXISTS idx_kg_edges_to_type ON kg_edges (to_id, type);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_from_type ON aurora_edges (from_id, type);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_to_type ON aurora_edges (to_id, type);
CREATE INDEX IF NOT EXISTS idx_confidence_audit_created ON confidence_audit (created_at);
CREATE INDEX IF NOT EXISTS idx_run_statistics_dim_ts ON run_statistics (dimension, updated_at);
