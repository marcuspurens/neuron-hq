-- Migration 014: Ontology indexes for concept nodes and hierarchy

-- Index for concept-noder
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_concept_type
  ON aurora_nodes (type)
  WHERE type = 'concept';

-- Index for children lookup (broader_than edges)
CREATE INDEX IF NOT EXISTS idx_aurora_edges_broader
  ON aurora_edges (to_id, type)
  WHERE type = 'broader_than';

-- Index for articles per concept (about edges)
CREATE INDEX IF NOT EXISTS idx_aurora_edges_about
  ON aurora_edges (to_id, type)
  WHERE type = 'about';
