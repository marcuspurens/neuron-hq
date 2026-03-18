-- Migration 013: Knowledge Library
-- Indexes for article queries (nodes use existing aurora_nodes table)

CREATE INDEX IF NOT EXISTS idx_aurora_nodes_article_type
  ON aurora_nodes (type, created DESC)
  WHERE type = 'article';

CREATE INDEX IF NOT EXISTS idx_aurora_edges_supersedes
  ON aurora_edges (from_id, type)
  WHERE type = 'supersedes';

CREATE INDEX IF NOT EXISTS idx_aurora_nodes_article_domain
  ON aurora_nodes ((properties->>'domain'))
  WHERE type = 'article';
