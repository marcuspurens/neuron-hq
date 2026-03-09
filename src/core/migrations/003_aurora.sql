-- Aurora knowledge graph nodes
CREATE TABLE IF NOT EXISTS aurora_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'document', 'transcript', 'fact', 'preference', 'research', 'voice_print'
  )),
  title TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  scope TEXT DEFAULT 'personal',
  source_url TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embedding vector(1024)
);

CREATE INDEX IF NOT EXISTS idx_aurora_nodes_type ON aurora_nodes(type);
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_scope ON aurora_nodes(scope);
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_confidence ON aurora_nodes(confidence);
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_embedding
  ON aurora_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Aurora knowledge graph edges
CREATE TABLE IF NOT EXISTS aurora_edges (
  id SERIAL PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES aurora_nodes(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES aurora_nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'related_to', 'derived_from', 'references', 'contradicts', 'supports'
  )),
  metadata JSONB DEFAULT '{}',
  UNIQUE(from_id, to_id, type)
);

CREATE INDEX IF NOT EXISTS idx_aurora_edges_from ON aurora_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_to ON aurora_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_aurora_edges_type ON aurora_edges(type);
