-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to knowledge graph nodes
ALTER TABLE kg_nodes ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- Create HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_kg_nodes_embedding
  ON kg_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
