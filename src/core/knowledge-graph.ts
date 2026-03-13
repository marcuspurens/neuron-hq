import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { getPool, isDbAvailable } from './db.js';
import { isEmbeddingAvailable, getEmbeddingProvider } from './embeddings.js';

// --- Schemas ---

/** Node types in the knowledge graph. */
export const NodeTypeSchema = z.enum([
  'pattern',
  'error',
  'technique',
  'run',
  'agent',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

/** Scope of a knowledge graph node. */
export const NodeScopeSchema = z.enum(['universal', 'project-specific', 'unknown']);
export type NodeScope = z.infer<typeof NodeScopeSchema>;

/** Edge types in the knowledge graph. */
export const EdgeTypeSchema = z.enum([
  'solves',
  'discovered_in',
  'related_to',
  'causes',
  'used_by',
]);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/** A single node in the knowledge graph. */
export const KGNodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeSchema,
  title: z.string().min(1),
  properties: z.record(z.unknown()),
  created: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  updated: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  confidence: z.number().min(0).max(1),
  scope: NodeScopeSchema.default('unknown'),
  model: z.string().nullish(),
});
export type KGNode = z.infer<typeof KGNodeSchema>;

/** A directed edge in the knowledge graph. */
export const KGEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: EdgeTypeSchema,
  metadata: z.object({
    runId: z.string().optional(),
    agent: z.string().optional(),
    timestamp: z.string().optional(),
  }),
});
export type KGEdge = z.infer<typeof KGEdgeSchema>;

/** The full knowledge graph document. */
export const KnowledgeGraphSchema = z.object({
  version: z.string(),
  nodes: z.array(KGNodeSchema),
  edges: z.array(KGEdgeSchema),
  lastUpdated: z.string(),
});
export type KnowledgeGraph = z.infer<typeof KnowledgeGraphSchema>;

// --- Default path ---

const DEFAULT_GRAPH_PATH = path.resolve(
  import.meta.dirname ?? '.',
  '../../memory/graph.json',
);

// --- CRUD Operations ---

/** Create a new empty knowledge graph. */
export function createEmptyGraph(): KnowledgeGraph {
  return {
    version: '1.0.0',
    nodes: [],
    edges: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Migrate nodes that lack a scope field, setting them to 'unknown'.
 * Returns the migrated graph and the count of migrated nodes.
 */
export function migrateAddScope(graph: KnowledgeGraph): {
  graph: KnowledgeGraph;
  migrated: number;
} {
  let migrated = 0;
  const newNodes = graph.nodes.map((node) => {
    if (!node.scope) {
      migrated++;
      return { ...node, scope: 'unknown' as const };
    }
    return node;
  });
  return {
    graph: { ...graph, nodes: newNodes, lastUpdated: new Date().toISOString() },
    migrated,
  };
}

// --- DB helpers ---

/**
 * Load knowledge graph from Postgres.
 * Returns null if loading fails.
 */
export async function loadGraphFromDb(): Promise<KnowledgeGraph | null> {
  try {
    const pool = getPool();

    const { rows: nodeRows } = await pool.query(
      'SELECT id, type, title, properties, confidence, scope, model, created, updated FROM kg_nodes',
    );

    const { rows: edgeRows } = await pool.query(
      'SELECT from_id, to_id, type, metadata FROM kg_edges',
    );

    const nodes: KGNode[] = nodeRows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      type: r.type as NodeType,
      title: r.title as string,
      properties: (r.properties ?? {}) as Record<string, unknown>,
      confidence: r.confidence as number,
      scope: (r.scope ?? 'unknown') as NodeScope,
      model: r.model as string | undefined,
      created: (r.created as Date).toISOString(),
      updated: (r.updated as Date).toISOString(),
    }));

    const edges: KGEdge[] = edgeRows.map((r: Record<string, unknown>) => ({
      from: r.from_id as string,
      to: r.to_id as string,
      type: r.type as EdgeType,
      metadata: (r.metadata ?? {}) as { runId?: string; agent?: string; timestamp?: string },
    }));

    return {
      version: '1.0.0',
      nodes,
      edges,
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Warning: Failed to load knowledge graph from DB:', err);
    return null;
  }
}

/**
 * Save knowledge graph to Postgres (upsert all nodes and edges).
 * Used as part of dual-write alongside file save.
 */
export async function saveGraphToDb(graph: KnowledgeGraph): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert nodes
    for (const node of graph.nodes) {
      await client.query(
        `INSERT INTO kg_nodes (id, type, title, properties, confidence, scope, model, created, updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type,
           title = EXCLUDED.title,
           properties = EXCLUDED.properties,
           confidence = EXCLUDED.confidence,
           scope = EXCLUDED.scope,
           model = EXCLUDED.model,
           updated = EXCLUDED.updated`,
        [
          node.id,
          node.type,
          node.title,
          JSON.stringify(node.properties),
          node.confidence,
          node.scope ?? 'unknown',
          node.model ?? null,
          node.created,
          node.updated,
        ],
      );
    }

    // Sync edges: delete edges not in graph, upsert edges in graph
    const graphEdgeKeys = new Set(
      graph.edges.map((e) => `${e.from}|${e.to}|${e.type}`),
    );

    // Get existing edges from DB
    const { rows: existingEdges } = await client.query(
      'SELECT from_id, to_id, type FROM kg_edges',
    );

    // Batch delete edges not in graph
    const edgesToDelete = existingEdges.filter(
      (row: Record<string, unknown>) => !graphEdgeKeys.has(`${row.from_id}|${row.to_id}|${row.type}`)
    );
    if (edgesToDelete.length > 0) {
      const froms = edgesToDelete.map((r: Record<string, unknown>) => r.from_id as string);
      const tos = edgesToDelete.map((r: Record<string, unknown>) => r.to_id as string);
      const types = edgesToDelete.map((r: Record<string, unknown>) => r.type as string);
      await client.query(
        `DELETE FROM kg_edges WHERE (from_id, to_id, type) IN (
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
         )`,
        [froms, tos, types],
      );
    }

    // Batch upsert edges
    if (graph.edges.length > 0) {
      const froms = graph.edges.map(e => e.from);
      const tos = graph.edges.map(e => e.to);
      const types = graph.edges.map(e => e.type);
      const metas = graph.edges.map(e => JSON.stringify(e.metadata));
      await client.query(
        `INSERT INTO kg_edges (from_id, to_id, type, metadata)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::jsonb[])
         ON CONFLICT (from_id, to_id, type) DO UPDATE SET
           metadata = EXCLUDED.metadata`,
        [froms, tos, types, metas],
      );
    }

    // Batch delete nodes not in graph
    const graphNodeIds = new Set(graph.nodes.map((n) => n.id));
    const { rows: existingNodes } = await client.query('SELECT id FROM kg_nodes');
    const nodesToDelete = existingNodes
      .filter((row: Record<string, unknown>) => !graphNodeIds.has(row.id as string))
      .map((row: Record<string, unknown>) => row.id);
    if (nodesToDelete.length > 0) {
      await client.query(
        'DELETE FROM kg_nodes WHERE id = ANY($1::text[])',
        [nodesToDelete],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


/**
 * Generate embeddings for nodes that were just saved to DB but don't have embeddings yet.
 * Called as part of saveGraph. Non-fatal: logs warning on failure.
 */
export async function autoEmbedNodes(nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) return;
  try {
    if (!(await isEmbeddingAvailable())) return;
    
    const pool = getPool();
    const provider = getEmbeddingProvider();
    
    // Get nodes that need embedding
    const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT id, type, title, properties FROM kg_nodes WHERE id IN (${placeholders}) AND embedding IS NULL`,
      nodeIds,
    );
    
    // Build texts for all nodes
    const texts = rows.map((node: Record<string, unknown>) =>
      `${node.type}: ${node.title}. ${JSON.stringify(node.properties)}`
    );

    // Process in batches of 20
    const BATCH_SIZE = 20;
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + BATCH_SIZE);
      const batchRows = rows.slice(i, i + BATCH_SIZE);
      try {
        const embeddings = await provider.embedBatch(batchTexts);
        const ids = batchRows.map((r: Record<string, unknown>) => r.id as string);
        const vectors = embeddings.map((e: number[]) => `[${e.join(',')}]`);

        await pool.query(
          `UPDATE kg_nodes AS n
           SET embedding = v.emb::vector
           FROM unnest($1::text[], $2::text[]) AS v(id, emb)
           WHERE n.id = v.id`,
          [ids, vectors],
        );
      } catch (err) {
        console.warn(`Warning: Failed to embed batch starting at index ${i}:`, err);
      }
    }
  } catch (err) {
    console.warn('Warning: Auto-embed failed:', err);
  }
}

// --- Load / Save ---

/**
 * Load a knowledge graph from DB (preferred) or JSON file (fallback).
 * Returns an empty graph if both sources are unavailable.
 */
export async function loadGraph(
  filePath: string = DEFAULT_GRAPH_PATH,
): Promise<KnowledgeGraph> {
  // Try loading from DB first
  if (await isDbAvailable()) {
    const dbGraph = await loadGraphFromDb();
    if (dbGraph && dbGraph.nodes.length > 0) {
      return dbGraph;
    }
  }

  // Fallback to file
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data: unknown = JSON.parse(raw);
    const graph = KnowledgeGraphSchema.parse(data);
    const { graph: migrated } = migrateAddScope(graph);
    return migrated;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return createEmptyGraph();
    }
    throw err;
  }
}

/**
 * Save a knowledge graph to file (always) and DB (if available).
 * Validates with Zod before writing. DB failure is non-fatal.
 */
export async function saveGraph(
  graph: KnowledgeGraph,
  filePath: string = DEFAULT_GRAPH_PATH,
): Promise<void> {
  // Always save to file (primary/backup)
  const validated = KnowledgeGraphSchema.parse(graph);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(validated, null, 2), 'utf-8');

  // Also save to DB if available (dual write)
  try {
    if (await isDbAvailable()) {
      await saveGraphToDb(validated);
      // Auto-embed new/updated nodes
      const nodeIds = validated.nodes.map(n => n.id);
      await autoEmbedNodes(nodeIds);
    }
  } catch (err) {
    console.warn('Warning: DB write failed during saveGraph (file backup exists):', err);
  }
}

// --- Pure graph operations ---

/**
 * Add a node to the graph. Returns a new graph.
 * Throws if the node id is a duplicate or the node is invalid.
 */
export function addNode(graph: KnowledgeGraph, node: KGNode): KnowledgeGraph {
  const validated = KGNodeSchema.parse(node);
  if (graph.nodes.some((n) => n.id === validated.id)) {
    throw new Error(`Duplicate node id: ${validated.id}`);
  }
  return {
    ...graph,
    nodes: [...graph.nodes, validated],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Add an edge to the graph. Returns a new graph.
 * Throws if from/to node ids do not exist or the edge is invalid.
 */
export function addEdge(graph: KnowledgeGraph, edge: KGEdge): KnowledgeGraph {
  const validated = KGEdgeSchema.parse(edge);
  if (!graph.nodes.some((n) => n.id === validated.from)) {
    throw new Error(`Node not found: ${validated.from}`);
  }
  if (!graph.nodes.some((n) => n.id === validated.to)) {
    throw new Error(`Node not found: ${validated.to}`);
  }
  return {
    ...graph,
    edges: [...graph.edges, validated],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Find nodes matching optional type, keyword query, and/or scope.
 * Query is case-insensitive and matches title + property values.
 */
export function findNodes(
  graph: KnowledgeGraph,
  filter: { type?: NodeType; query?: string; scope?: NodeScope },
): KGNode[] {
  return graph.nodes.filter((node) => {
    if (filter.type && node.type !== filter.type) return false;
    if (filter.scope && node.scope !== filter.scope) return false;
    if (filter.query) {
      const q = filter.query.toLowerCase();
      const inTitle = node.title.toLowerCase().includes(q);
      const inProps = Object.values(node.properties).some((v) =>
        String(v).toLowerCase().includes(q),
      );
      if (!inTitle && !inProps) return false;
    }
    return true;
  });
}

/**
 * BFS traversal from startId following edges (bidirectional).
 * Returns found nodes (excluding the start node).
 */
export function traverse(
  graph: KnowledgeGraph,
  startId: string,
  edgeType?: EdgeType,
  depth: number = 1,
): KGNode[] {
  if (!graph.nodes.some((n) => n.id === startId)) {
    throw new Error(`Node not found: ${startId}`);
  }

  const visited = new Set<string>([startId]);
  let frontier: string[] = [startId];
  const result: KGNode[] = [];

  for (let d = 0; d < depth; d++) {
    const nextFrontier: string[] = [];
    for (const currentId of frontier) {
      const neighbors = graph.edges
        .filter((e) => {
          if (edgeType && e.type !== edgeType) return false;
          return e.from === currentId || e.to === currentId;
        })
        .map((e) => (e.from === currentId ? e.to : e.from))
        .filter((id) => !visited.has(id));

      for (const neighborId of neighbors) {
        visited.add(neighborId);
        nextFrontier.push(neighborId);
        const node = graph.nodes.find((n) => n.id === neighborId);
        if (node) result.push(node);
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return result;
}

/**
 * Update a node's confidence, properties, and/or title.
 * Returns a new graph with the updated node.
 */
export function updateNode(
  graph: KnowledgeGraph,
  id: string,
  updates: Partial<Pick<KGNode, 'confidence' | 'properties' | 'title'>>,
): KnowledgeGraph {
  const idx = graph.nodes.findIndex((n) => n.id === id);
  if (idx === -1) {
    throw new Error(`Node not found: ${id}`);
  }
  const existing = graph.nodes[idx];
  const updated: KGNode = {
    ...existing,
    ...updates,
    updated: new Date().toISOString(),
  };
  KGNodeSchema.parse(updated);
  const nodes = [...graph.nodes];
  nodes[idx] = updated;
  return { ...graph, nodes, lastUpdated: new Date().toISOString() };
}

/**
 * Remove a node and all edges referencing it.
 * Returns a new graph.
 */
export function removeNode(
  graph: KnowledgeGraph,
  id: string,
): KnowledgeGraph {
  if (!graph.nodes.some((n) => n.id === id)) {
    throw new Error(`Node not found: ${id}`);
  }
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.from !== id && e.to !== id),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Apply confidence decay to nodes that haven't been updated recently.
 * Returns a new graph (immutable pattern).
 */
export function applyConfidenceDecay(
  graph: KnowledgeGraph,
  options: { maxRunsSinceConfirm?: number; decayFactor?: number } = {},
): KnowledgeGraph {
  const maxAge = options.maxRunsSinceConfirm ?? 20;
  const factor = options.decayFactor ?? 0.9;

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - maxAge);
  const thresholdISO = thresholdDate.toISOString();

  const now = new Date().toISOString();

  const newNodes = graph.nodes.map((node) => {
    if (node.properties.decay_applied === true) {
      return node;
    }

    if (node.updated >= thresholdISO) {
      return node;
    }

    const newConfidence = Math.max(
      0,
      parseFloat((node.confidence * factor).toFixed(4)),
    );

    const newProperties: Record<string, unknown> = {
      ...node.properties,
      decay_applied: true,
    };
    if (newConfidence < 0.1) {
      newProperties.stale = true;
    }

    return {
      ...node,
      confidence: newConfidence,
      properties: newProperties,
      updated: now,
    };
  });

  return {
    ...graph,
    nodes: newNodes,
    lastUpdated: now,
  };
}
