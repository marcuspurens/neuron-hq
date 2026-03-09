import { getPool } from '../core/db.js';
import { semanticSearch } from '../core/semantic-search.js';

// --- Interfaces ---

export interface CrossRef {
  id: number;
  neuronNodeId: string;
  auroraNodeId: string;
  relationship: 'supports' | 'contradicts' | 'enriches' | 'discovered_via';
  similarity: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CrossRefMatch {
  node: { id: string; title: string; type: string; confidence: number };
  source: 'neuron' | 'aurora';
  similarity: number;
  existingRef?: CrossRef;
}

export interface UnifiedSearchOptions {
  limit?: number; // default 10
  minSimilarity?: number; // default 0.3
  type?: string;
}

export interface UnifiedSearchResult {
  neuronResults: CrossRefMatch[];
  auroraResults: CrossRefMatch[];
  crossRefs: CrossRef[];
}

// --- Private helpers ---

/** Map a snake_case DB row to a camelCase CrossRef object. */
function rowToCrossRef(row: Record<string, unknown>): CrossRef {
  return {
    id: row.id as number,
    neuronNodeId: row.neuron_node_id as string,
    auroraNodeId: row.aurora_node_id as string,
    relationship: row.relationship as CrossRef['relationship'],
    similarity: row.similarity as number | null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// --- Public functions ---

/**
 * Search both Neuron and Aurora knowledge graphs in parallel,
 * returning unified results with any existing cross-references.
 */
export async function unifiedSearch(
  query: string,
  options?: UnifiedSearchOptions,
): Promise<UnifiedSearchResult> {
  const limit = options?.limit ?? 10;
  const minSimilarity = options?.minSimilarity ?? 0.3;
  const type = options?.type;

  // Run both searches in parallel
  const [neuronRaw, auroraRaw] = await Promise.all([
    semanticSearch(query, {
      table: 'kg_nodes',
      limit,
      minSimilarity,
      type,
    }),
    semanticSearch(query, {
      table: 'aurora_nodes',
      limit,
      minSimilarity,
      type,
    }),
  ]);

  // Map to CrossRefMatch format
  const neuronResults: CrossRefMatch[] = neuronRaw.map((r) => ({
    node: { id: r.id, title: r.title, type: r.type, confidence: r.confidence },
    source: 'neuron' as const,
    similarity: r.similarity,
  }));

  const auroraResults: CrossRefMatch[] = auroraRaw.map((r) => ({
    node: { id: r.id, title: r.title, type: r.type, confidence: r.confidence },
    source: 'aurora' as const,
    similarity: r.similarity,
  }));

  // Collect all node IDs and fetch existing cross-refs
  const allNodeIds = [
    ...neuronResults.map((r) => r.node.id),
    ...auroraResults.map((r) => r.node.id),
  ];

  const crossRefsByNode = new Map<string, CrossRef[]>();
  const allCrossRefs: CrossRef[] = [];

  for (const nodeId of allNodeIds) {
    if (crossRefsByNode.has(nodeId)) continue;
    const refs = await getCrossRefs(nodeId);
    crossRefsByNode.set(nodeId, refs);
    allCrossRefs.push(...refs);
  }

  // Attach existingRef to matching items
  for (const match of neuronResults) {
    const refs = crossRefsByNode.get(match.node.id) ?? [];
    if (refs.length > 0) {
      match.existingRef = refs[0];
    }
  }
  for (const match of auroraResults) {
    const refs = crossRefsByNode.get(match.node.id) ?? [];
    if (refs.length > 0) {
      match.existingRef = refs[0];
    }
  }

  return { neuronResults, auroraResults, crossRefs: allCrossRefs };
}

/**
 * Create or update a cross-reference between a Neuron node and an Aurora node.
 * Uses upsert — on conflict updates similarity and metadata.
 */
export async function createCrossRef(
  neuronNodeId: string,
  auroraNodeId: string,
  relationship: CrossRef['relationship'],
  similarity?: number,
  metadata?: Record<string, unknown>,
): Promise<CrossRef> {
  const pool = getPool();

  const result = await pool.query(
    `INSERT INTO cross_refs (neuron_node_id, aurora_node_id, relationship, similarity, metadata)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (neuron_node_id, aurora_node_id, relationship)
     DO UPDATE SET similarity = EXCLUDED.similarity, metadata = EXCLUDED.metadata
     RETURNING *`,
    [
      neuronNodeId,
      auroraNodeId,
      relationship,
      similarity ?? null,
      JSON.stringify(metadata ?? {}),
    ],
  );

  return rowToCrossRef(result.rows[0] as Record<string, unknown>);
}

/**
 * Get all cross-references for a given node ID (either Neuron or Aurora side).
 */
export async function getCrossRefs(nodeId: string): Promise<CrossRef[]> {
  const pool = getPool();

  const result = await pool.query(
    'SELECT * FROM cross_refs WHERE neuron_node_id = $1 OR aurora_node_id = $1',
    [nodeId],
  );

  return result.rows.map((row: Record<string, unknown>) => rowToCrossRef(row));
}

/**
 * Find Aurora nodes similar to a given Neuron node using embedding distance.
 * Uses direct SQL against pre-computed embeddings (not semanticSearch).
 */
export async function findAuroraMatchesForNeuron(
  neuronNodeId: string,
  options?: { limit?: number; minSimilarity?: number },
): Promise<CrossRefMatch[]> {
  const limit = options?.limit ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0.5;
  const pool = getPool();

  const result = await pool.query(
    `SELECT id, title, type, confidence,
            1 - (embedding <=> (SELECT embedding FROM kg_nodes WHERE id = $1)) AS similarity
     FROM aurora_nodes
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> (SELECT embedding FROM kg_nodes WHERE id = $1)) >= $2
     ORDER BY embedding <=> (SELECT embedding FROM kg_nodes WHERE id = $1)
     LIMIT $3`,
    [neuronNodeId, minSimilarity, limit],
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    node: {
      id: row.id as string,
      title: row.title as string,
      type: row.type as string,
      confidence: row.confidence as number,
    },
    source: 'aurora' as const,
    similarity: row.similarity as number,
  }));
}

/**
 * Find Neuron nodes similar to a given Aurora node using embedding distance.
 * Uses direct SQL against pre-computed embeddings (not semanticSearch).
 */
export async function findNeuronMatchesForAurora(
  auroraNodeId: string,
  options?: { limit?: number; minSimilarity?: number },
): Promise<CrossRefMatch[]> {
  const limit = options?.limit ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0.5;
  const pool = getPool();

  const result = await pool.query(
    `SELECT id, title, type, confidence,
            1 - (embedding <=> (SELECT embedding FROM aurora_nodes WHERE id = $1)) AS similarity
     FROM kg_nodes
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> (SELECT embedding FROM aurora_nodes WHERE id = $1)) >= $2
     ORDER BY embedding <=> (SELECT embedding FROM aurora_nodes WHERE id = $1)
     LIMIT $3`,
    [auroraNodeId, minSimilarity, limit],
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    node: {
      id: row.id as string,
      title: row.title as string,
      type: row.type as string,
      confidence: row.confidence as number,
    },
    source: 'neuron' as const,
    similarity: row.similarity as number,
  }));
}
