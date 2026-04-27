import { getPool } from '../core/db.js';
import { semanticSearch } from '../core/semantic-search.js';
import { AURORA_SIMILARITY, AURORA_CONFIDENCE } from './llm-defaults.js';

// --- Interfaces ---

export interface CrossRef {
  id: number;
  neuronNodeId: string;
  auroraNodeId: string;
  relationship: 'supports' | 'contradicts' | 'enriches' | 'discovered_via';
  similarity: number | null;
  metadata: Record<string, unknown>;
  context: string | null;
  strength: number | null;
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

// --- Integrity types ---

export interface IntegrityIssue {
  crossRefId: number;
  neuronNodeId: string;
  neuronTitle: string;
  neuronConfidence: number;
  auroraNodeId: string;
  auroraTitle: string;
  issue: 'low_confidence' | 'stale_neuron' | 'orphaned';
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
    context: (row.context as string) ?? null,
    strength: (row.strength as number) ?? null,
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
  const minSimilarity = options?.minSimilarity ?? AURORA_SIMILARITY.searchLoose;
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

  const crossRefsByNode = await getCrossRefsBatch(allNodeIds);
  const allCrossRefs = [...new Set([...crossRefsByNode.values()].flat())];

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
  context?: string,
  strength?: number,
): Promise<CrossRef> {
  const pool = getPool();

  const result = await pool.query(
    `INSERT INTO cross_refs (neuron_node_id, aurora_node_id, relationship, similarity, metadata, context, strength)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (neuron_node_id, aurora_node_id, relationship)
     DO UPDATE SET similarity = EXCLUDED.similarity, metadata = EXCLUDED.metadata,
                   context = COALESCE(EXCLUDED.context, cross_refs.context),
                   strength = COALESCE(EXCLUDED.strength, cross_refs.strength)
     RETURNING *`,
    [
      neuronNodeId,
      auroraNodeId,
      relationship,
      similarity ?? null,
      JSON.stringify(metadata ?? {}),
      context ?? null,
      strength ?? similarity ?? null,
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
 * Batch-fetch cross-references for multiple node IDs in a single query.
 * Each node ID is checked on both neuron_node_id and aurora_node_id sides.
 */
export async function getCrossRefsBatch(nodeIds: string[]): Promise<Map<string, CrossRef[]>> {
  if (nodeIds.length === 0) return new Map();
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM cross_refs WHERE neuron_node_id = ANY($1::text[]) OR aurora_node_id = ANY($1::text[])',
    [nodeIds],
  );
  const map = new Map<string, CrossRef[]>();
  for (const row of result.rows) {
    const ref = rowToCrossRef(row as Record<string, unknown>);
    for (const id of nodeIds) {
      if ((row as Record<string, unknown>).neuron_node_id === id || (row as Record<string, unknown>).aurora_node_id === id) {
        const existing = map.get(id) ?? [];
        existing.push(ref);
        map.set(id, existing);
      }
    }
  }
  return map;
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
  const minSimilarity = options?.minSimilarity ?? AURORA_SIMILARITY.search;
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
  const minSimilarity = options?.minSimilarity ?? AURORA_SIMILARITY.search;
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

// --- Integrity functions ---

/**
 * Transfer cross-refs from a removed node to a surviving node.
 * Handles duplicates — skips transfers that would create conflicts.
 * Called by Consolidator after node-merge.
 */
export async function transferCrossRefs(
  removedNodeId: string,
  keptNodeId: string,
  side: 'neuron' | 'aurora',
): Promise<number> {
  const pool = getPool();
  const column = side === 'neuron' ? 'neuron_node_id' : 'aurora_node_id';
  const otherColumn = side === 'neuron' ? 'aurora_node_id' : 'neuron_node_id';

  // Move cross-refs: removed → kept (skip duplicates)
  const result = await pool.query(`
    UPDATE cross_refs
    SET ${column} = $1,
        context = COALESCE(context, '') || ' [transferred from merge]'
    WHERE ${column} = $2
    AND NOT EXISTS (
      SELECT 1 FROM cross_refs cr2
      WHERE cr2.${column} = $1
        AND cr2.${otherColumn} = cross_refs.${otherColumn}
        AND cr2.relationship = cross_refs.relationship
    )
  `, [keptNodeId, removedNodeId]);

  // Remove any remaining refs that couldn't be transferred (duplicates)
  await pool.query(`
    DELETE FROM cross_refs WHERE ${column} = $1
  `, [removedNodeId]);

  return result.rowCount ?? 0;
}

/**
 * Find cross-refs pointing to Neuron nodes with confidence below threshold.
 * Used by briefing and freshness reports to warn about weak connections.
 */
export async function checkCrossRefIntegrity(options?: {
  confidenceThreshold?: number;
  limit?: number;
}): Promise<IntegrityIssue[]> {
  const pool = getPool();
  const threshold = options?.confidenceThreshold ?? AURORA_CONFIDENCE.initial;
  const limit = options?.limit ?? 20;

  const { rows } = await pool.query(`
    SELECT cr.id, cr.neuron_node_id, cr.aurora_node_id, cr.relationship,
           kn.title AS neuron_title, kn.confidence AS neuron_confidence,
           an.title AS aurora_title
    FROM cross_refs cr
    JOIN kg_nodes kn ON kn.id = cr.neuron_node_id
    JOIN aurora_nodes an ON an.id = cr.aurora_node_id
    WHERE kn.confidence < $1
    ORDER BY kn.confidence ASC
    LIMIT $2
  `, [threshold, limit]);

  return rows.map((row: Record<string, unknown>) => ({
    crossRefId: row.id as number,
    neuronNodeId: row.neuron_node_id as string,
    neuronTitle: row.neuron_title as string,
    neuronConfidence: row.neuron_confidence as number,
    auroraNodeId: row.aurora_node_id as string,
    auroraTitle: row.aurora_title as string,
    issue: 'low_confidence' as const,
  }));
}
