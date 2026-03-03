import { getPool } from './db.js';
import { getEmbeddingProvider } from './embeddings.js';

export interface SemanticResult {
  id: string;
  title: string;
  type: string;
  similarity: number;
  confidence: number;
  scope: string;
}

/**
 * Find nodes semantically similar to query text.
 * Uses pgvector cosine distance on pre-computed embeddings.
 */
export async function semanticSearch(
  query: string,
  options?: {
    type?: string;
    limit?: number;
    minSimilarity?: number;
    scope?: string;
  }
): Promise<SemanticResult[]> {
  const provider = getEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);
  const pool = getPool();

  const limit = options?.limit ?? 10;
  const minSim = options?.minSimilarity ?? 0.7;

  let sql = `
    SELECT id, title, type, confidence, scope,
           1 - (embedding <=> $1::vector) AS similarity
    FROM kg_nodes
    WHERE embedding IS NOT NULL
  `;
  const params: unknown[] = [`[${queryEmbedding.join(',')}]`];
  let paramIdx = 2;

  if (options?.type) {
    sql += ` AND type = $${paramIdx}`;
    params.push(options.type);
    paramIdx++;
  }
  if (options?.scope) {
    sql += ` AND scope = $${paramIdx}`;
    params.push(options.scope);
    paramIdx++;
  }

  sql += ` AND 1 - (embedding <=> $1::vector) >= $${paramIdx}`;
  params.push(minSim);
  paramIdx++;

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIdx}`;
  params.push(limit);

  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Find the N most similar nodes to a given node.
 * Useful for Consolidator dedup and cross-type discovery.
 */
export async function findSimilarNodes(
  nodeId: string,
  options?: { limit?: number; minSimilarity?: number }
): Promise<SemanticResult[]> {
  const pool = getPool();
  const limit = options?.limit ?? 5;
  const minSim = options?.minSimilarity ?? 0.8;

  const result = await pool.query(
    `
    SELECT b.id, b.title, b.type, b.confidence, b.scope,
           1 - (a.embedding <=> b.embedding) AS similarity
    FROM kg_nodes a, kg_nodes b
    WHERE a.id = $1
      AND b.id != $1
      AND a.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND 1 - (a.embedding <=> b.embedding) >= $2
    ORDER BY a.embedding <=> b.embedding
    LIMIT $3
    `,
    [nodeId, minSim, limit]
  );
  return result.rows;
}
