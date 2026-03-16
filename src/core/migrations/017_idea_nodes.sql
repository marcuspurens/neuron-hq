-- Migration 017: Add idea node type and inspired_by edge type
ALTER TABLE kg_nodes DROP CONSTRAINT IF EXISTS kg_nodes_type_check;
ALTER TABLE kg_nodes ADD CONSTRAINT kg_nodes_type_check
  CHECK (type IN ('pattern', 'error', 'technique', 'run', 'agent', 'idea'));

ALTER TABLE kg_edges DROP CONSTRAINT IF EXISTS kg_edges_type_check;
ALTER TABLE kg_edges ADD CONSTRAINT kg_edges_type_check
  CHECK (type IN ('solves', 'discovered_in', 'related_to', 'causes', 'used_by', 'inspired_by'));
