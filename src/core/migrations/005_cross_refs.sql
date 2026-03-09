-- Cross-references between Neuron KG and Aurora KG
CREATE TABLE IF NOT EXISTS cross_refs (
  id SERIAL PRIMARY KEY,
  neuron_node_id TEXT NOT NULL REFERENCES kg_nodes(id),
  aurora_node_id TEXT NOT NULL REFERENCES aurora_nodes(id),
  relationship TEXT NOT NULL CHECK (relationship IN (
    'supports',
    'contradicts',
    'enriches',
    'discovered_via'
  )),
  similarity REAL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(neuron_node_id, aurora_node_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_cross_refs_neuron ON cross_refs(neuron_node_id);
CREATE INDEX IF NOT EXISTS idx_cross_refs_aurora ON cross_refs(aurora_node_id);
