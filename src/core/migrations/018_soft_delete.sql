-- Soft delete: preserve metadata for deleted Aurora nodes (30 day retention)
CREATE TABLE IF NOT EXISTS aurora_deleted_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.5,
  scope TEXT NOT NULL DEFAULT 'personal',
  source_url TEXT,
  original_created TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by TEXT NOT NULL DEFAULT 'obsidian-sync',
  children_deleted TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_aurora_deleted_expires ON aurora_deleted_nodes (expires_at);
