import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { getPool, isDbAvailable } from './db.js';
import { isEmbeddingAvailable, getEmbeddingProvider } from './embeddings.js';
import { createLogger } from './logger.js';
import { parseIdeasMd } from './ideas-parser.js';
import { personalizedPageRank } from './ppr.js';

const logger = createLogger('graph');

// --- Schemas ---

/** Node types in the knowledge graph. */
export const NodeTypeSchema = z.enum([
  'pattern',
  'error',
  'technique',
  'run',
  'agent',
  'idea',
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
  'inspired_by',
  'generalizes',
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

/** Zod schema for idea-specific node properties. */
export const IdeaPropertiesSchema = z.object({
  description: z.string(),
  impact: z.number().int().min(1).max(5),       // 1=minimal, 5=transformativ
  effort: z.number().int().min(1).max(5),       // 1=XS, 5=XL
  risk: z.number().int().min(1).max(5).default(3),
  priority: z.number().min(0).max(5).optional(),
  status: z.enum(['proposed', 'accepted', 'in-progress', 'done', 'rejected']).default('proposed'),
  source_run: z.string().optional(),
  source_brief: z.string().optional(),
  provenance: z.enum(['agent', 'user', 'research']).default('agent'),
  group: z.string().optional(),
  tags: z.array(z.string()).default([]),
  mention_count: z.number().optional(),
  last_seen_run: z.string().optional(),
});
export type IdeaProperties = z.infer<typeof IdeaPropertiesSchema>;

/**
 * Compute normalized priority from impact, effort, and risk.
 * Formula: impact * (6-effort) * (6-risk) / 25
 * Range: 0.04 (worst) to 5.0 (best)
 */
export function computePriority(impact: number, effort: number, risk: number): number {
  return parseFloat(((impact * (6 - effort) * (6 - risk)) / 25).toFixed(2));
}


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
    logger.warn('Failed to load knowledge graph from DB', { error: String(err) });
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
        logger.warn('Failed to embed batch', { startIndex: String(i), error: String(err) });
      }
    }
  } catch (err) {
    logger.warn('Auto-embed failed', { error: String(err) });
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
    logger.warn('DB write failed during saveGraph (file backup exists)', { error: String(err) });
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

/**
 * Rank idea nodes by computed priority with optional filtering and connection boost.
 * Returns sorted KGNode[] (highest priority first).
 */
export function rankIdeas(
  graph: KnowledgeGraph,
  options?: {
    status?: string[];        // filter on status (default: ['proposed', 'accepted'])
    group?: string;           // filter on group
    minImpact?: number;       // minimum impact score
    limit?: number;           // max results (default: 10)
    boostConnected?: boolean; // give bonus for more connections (default: true)
  },
): KGNode[] {
  const opts = {
    status: options?.status ?? ['proposed', 'accepted'],
    group: options?.group,
    minImpact: options?.minImpact,
    limit: options?.limit ?? 10,
    boostConnected: options?.boostConnected ?? true,
  };

  // 1. Filter idea nodes
  let ideas = graph.nodes.filter(n => n.type === 'idea');

  // Filter by status
  if (opts.status.length > 0) {
    ideas = ideas.filter(n => {
      const status = n.properties.status as string | undefined;
      return status ? opts.status.includes(status) : true;
    });
  }

  // Filter by group
  if (opts.group) {
    ideas = ideas.filter(n => {
      const group = n.properties.group as string | undefined;
      return group?.toLowerCase() === opts.group!.toLowerCase();
    });
  }

  // Filter by minImpact
  if (opts.minImpact !== undefined) {
    ideas = ideas.filter(n => {
      const impact = n.properties.impact as number | undefined;
      return impact !== undefined && impact >= opts.minImpact!;
    });
  }

  // 2. Compute priority if missing, and calculate final score
  const scored = ideas.map(node => {
    const impact = (node.properties.impact as number) || 0;
    const effort = (node.properties.effort as number) || 0;
    const risk = (node.properties.risk as number) || 3;

    let priority = node.properties.priority as number | undefined;
    if (priority === undefined && impact > 0 && effort > 0) {
      priority = computePriority(impact, effort, risk);
    }

    let score = priority ?? 0;

    // 3. Connection boost: +0.1 per edge, max +0.5
    if (opts.boostConnected) {
      const edgeCount = graph.edges.filter(
        e => e.from === node.id || e.to === node.id
      ).length;
      score += Math.min(edgeCount * 0.1, 0.5);
    }

    return { node, score };
  });

  // 4. Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // 5. Return top N nodes
  return scored.slice(0, opts.limit).map(s => s.node);
}


// ---- Stop words for Jaccard similarity ----
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each',
  'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'only', 'own', 'same', 'than', 'too', 'very',
  'just', 'because', 'if', 'when', 'where', 'how', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those', 'it', 'its',
]);

/**
 * Extract meaningful words from text (lowercase, stop words removed).
 */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/).filter(w => w.length > 1);
  return new Set(words.filter(w => !STOP_WORDS.has(w)));
}

/**
 * Compute Jaccard similarity between two word sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Convert a KnowledgeGraph to adjacency format for PPR.
 * Includes ALL nodes and ALL edge types. Each graph edge becomes 2 directed edges (A->B + B->A).
 * Exported for testability.
 */
export function graphToAdjacency(graph: KnowledgeGraph): { nodes: string[]; edges: Array<{ from: string; to: string }> } {
  const nodes = graph.nodes.map(n => n.id);
  const edges: Array<{ from: string; to: string }> = [];
  for (const e of graph.edges) {
    edges.push({ from: e.from, to: e.to });
    edges.push({ from: e.to, to: e.from });
  }
  return { nodes, edges };
}

/**
 * Run PPR on the graph from seed nodes, returning ranked results.
 *
 * @throws Error('At least one seed node required') if seedNodeIds is empty
 * @throws Error('Node not found: <id>') if a seed node does not exist in the graph
 */
export function pprQuery(
  graph: KnowledgeGraph,
  seedNodeIds: string[],
  options?: {
    limit?: number;
    minScore?: number;
    excludeTypes?: NodeType[];
    excludeIds?: string[];
  },
): Array<{ node: KGNode; score: number }> {
  if (seedNodeIds.length === 0) {
    throw new Error('At least one seed node required');
  }

  for (const id of seedNodeIds) {
    if (!graph.nodes.find(n => n.id === id)) {
      throw new Error(`Node not found: ${id}`);
    }
  }

  const limit = options?.limit ?? 10;
  const minScore = options?.minScore ?? 0.01;
  const excludeTypes = new Set(options?.excludeTypes ?? []);
  const excludeIds = new Set([...seedNodeIds, ...(options?.excludeIds ?? [])]);

  const { nodes, edges } = graphToAdjacency(graph);

  const seeds = new Map<string, number>();
  for (const id of seedNodeIds) {
    seeds.set(id, 1 / seedNodeIds.length);
  }

  const pprResults = personalizedPageRank(nodes, edges, seeds);

  const results: Array<{ node: KGNode; score: number }> = [];
  for (const pr of pprResults) {
    if (excludeIds.has(pr.nodeId)) continue;
    if (pr.score < minScore) continue;
    const node = graph.nodes.find(n => n.id === pr.nodeId);
    if (!node) continue;
    if (excludeTypes.has(node.type)) continue;
    results.push({ node, score: pr.score });
    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Link related idea nodes via PPR graph structure + Jaccard text fallback.
 * Only creates idea-to-idea related_to edges. Checks for existing edges to prevent duplicates.
 * Returns a new graph with added edges.
 *
 * Not thread-safe (uses Set-based edge dedup). Currently called sequentially by historian agent.
 */
export function linkRelatedIdeas(
  graph: KnowledgeGraph,
  options?: {
    similarityThreshold?: number;  // Jaccard threshold, default 0.3
    maxEdgesPerNode?: number;      // default 3
  },
): KnowledgeGraph {
  const threshold = options?.similarityThreshold ?? 0.3;
  const maxEdges = options?.maxEdgesPerNode ?? 3;

  const ideas = graph.nodes.filter(n => n.type === 'idea');
  if (ideas.length < 2) return graph;

  // Build adjacency once for all PPR runs
  const adjacency = graphToAdjacency(graph);

  // Track existing related_to edge counts at START (only related_to, not derived_from etc.)
  const ideaIds = new Set(ideas.map(n => n.id));
  const startEdgeCounts = new Map<string, number>();
  const existingEdgeSet = new Set<string>();

  for (const idea of ideas) {
    let count = 0;
    for (const e of graph.edges) {
      if (e.type === 'related_to' && (e.from === idea.id || e.to === idea.id)) {
        const other = e.from === idea.id ? e.to : e.from;
        if (ideaIds.has(other)) {
          count++;
          const key = [e.from < e.to ? e.from : e.to, e.from < e.to ? e.to : e.from].join(':');
          existingEdgeSet.add(key);
        }
      }
    }
    startEdgeCounts.set(idea.id, count);
  }

  // Track edges created in this run
  const newEdgeSet = new Set<string>();
  const edgeCounts = new Map(startEdgeCounts);

  const now = new Date().toISOString();
  let result = graph;
  let pprNodes = 0;
  let jaccardFallbacks = 0;
  let newEdgesCount = 0;

  // Sort by node ID for deterministic iteration
  const sortedIdeas = [...ideas].sort((a, b) => a.id.localeCompare(b.id));

  // Pre-tokenize all ideas for potential Jaccard fallback
  const tokenized = new Map<string, Set<string>>();
  for (const idea of ideas) {
    tokenized.set(idea.id, tokenize(`${idea.title} ${(idea.properties.description as string) || ''}`));
  }

  for (const idea of sortedIdeas) {
    // Skip if already at maxEdges at START
    if ((startEdgeCounts.get(idea.id) || 0) >= maxEdges) continue;

    // Run PPR with this node as seed
    const seeds = new Map<string, number>([[idea.id, 1.0]]);
    const pprResults = personalizedPageRank(adjacency.nodes, adjacency.edges, seeds);

    // Filter PPR results
    const pprCandidates: Array<{ id: string; score: number }> = [];
    for (const pr of pprResults) {
      if (pr.nodeId === idea.id) continue;
      if (!ideaIds.has(pr.nodeId)) continue;
      if (pr.score < 0.01) continue;
      const key = [idea.id < pr.nodeId ? idea.id : pr.nodeId, idea.id < pr.nodeId ? pr.nodeId : idea.id].join(':');
      if (existingEdgeSet.has(key) || newEdgeSet.has(key)) continue;
      pprCandidates.push({ id: pr.nodeId, score: pr.score });
      if (pprCandidates.length >= 10) break;
    }

    if (pprCandidates.length > 0) pprNodes++;

    // Jaccard fallback: if node had < 2 related_to edges at start AND PPR gave < 2 candidates
    let jaccardCandidates: Array<{ id: string; score: number }> = [];
    const startRelatedCount = startEdgeCounts.get(idea.id) || 0;
    if (startRelatedCount < 2 && pprCandidates.length < 2) {
      jaccardFallbacks++;
      const ideaTokens = tokenized.get(idea.id)!;
      const scored: Array<{ id: string; score: number }> = [];
      for (const other of ideas) {
        if (other.id === idea.id) continue;
        const key = [idea.id < other.id ? idea.id : other.id, idea.id < other.id ? other.id : idea.id].join(':');
        if (existingEdgeSet.has(key) || newEdgeSet.has(key)) continue;
        const sim = jaccardSimilarity(ideaTokens, tokenized.get(other.id)!);
        if (sim >= threshold) {
          scored.push({ id: other.id, score: sim });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      jaccardCandidates = scored.slice(0, 10);
    }

    // Merge candidates: PPR first, then Jaccard additions
    const allCandidates = [...pprCandidates];
    const addedIds = new Set(pprCandidates.map(c => c.id));
    for (const jc of jaccardCandidates) {
      if (!addedIds.has(jc.id)) {
        allCandidates.push(jc);
        addedIds.add(jc.id);
      }
    }

    // Create edges respecting maxEdgesPerNode
    for (const candidate of allCandidates) {
      const fromCount = edgeCounts.get(idea.id) || 0;
      const toCount = edgeCounts.get(candidate.id) || 0;
      if (fromCount >= maxEdges || toCount >= maxEdges) continue;

      const key = [idea.id < candidate.id ? idea.id : candidate.id, idea.id < candidate.id ? candidate.id : idea.id].join(':');
      if (existingEdgeSet.has(key) || newEdgeSet.has(key)) continue;

      result = addEdge(result, {
        from: idea.id,
        to: candidate.id,
        type: 'related_to',
        metadata: {
          agent: 'linkRelatedIdeas',
          timestamp: now,
        },
      });

      newEdgeSet.add(key);
      edgeCounts.set(idea.id, fromCount + 1);
      edgeCounts.set(candidate.id, toCount + 1);
      newEdgesCount++;
    }
  }

  logger.info('linkRelatedIdeas completed', { pprNodes, jaccardFallbacks, newEdges: newEdgesCount });

  return result;
}


/**
 * Backfill ideas from all runs/{runId}/ideas.md files.
 * 1. Deletes ALL existing idea nodes (old string-based data)
 * 2. Parses all ideas.md files with updated numeric parser
 * 3. Creates new idea nodes with dedup (title-matching)
 * 4. Links related ideas
 * Returns the updated graph.
 */
export async function backfillIdeas(
  graph: KnowledgeGraph,
  runsDir: string,
): Promise<KnowledgeGraph> {
  // Step 1: Delete all existing idea nodes
  const ideaNodeIds = graph.nodes
    .filter((n) => n.type === 'idea')
    .map((n) => n.id);
  let result = graph;
  for (const id of ideaNodeIds) {
    result = removeNode(result, id);
  }

  // Step 2: Read all runs/{runId}/ideas.md files
  const entries = await fs
    .readdir(runsDir, { withFileTypes: true })
    .catch(() => [] as never[]);
  const runDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // chronological order (runid format: YYYYMMDD-HHMM-target)

  const allIdeas: Array<{
    title: string;
    description: string;
    group: string;
    impact: number;
    effort: number;
    risk: number;
    sourceRun: string;
  }> = [];

  for (const dir of runDirs) {
    const ideasPath = path.join(runsDir, dir, 'ideas.md');
    try {
      const content = await fs.readFile(ideasPath, 'utf-8');
      const ideas = parseIdeasMd(content);
      for (const idea of ideas) {
        allIdeas.push({
          ...idea,
          sourceRun: dir,
        });
      }
    } catch {
      // File doesn't exist or can't be read - skip
      continue;
    }
  }

  // Step 3: Dedup by title similarity and create nodes
  const seen = new Map<string, string>(); // normalized title -> node id
  let nextId = 1;
  const now = new Date().toISOString();

  for (const idea of allIdeas) {
    const normalizedTitle = idea.title.toLowerCase().trim();

    // Check for title-based dedup
    const existingId = seen.get(normalizedTitle);
    if (existingId) {
      // Update mention count and last_seen_run on existing node
      const existingNode = result.nodes.find((n) => n.id === existingId);
      if (existingNode) {
        const mentionCount =
          ((existingNode.properties.mention_count as number) || 1) + 1;
        result = updateNode(result, existingId, {
          confidence: Math.min(
            (existingNode.confidence || 0.5) + 0.1,
            1.0,
          ),
          properties: {
            ...existingNode.properties,
            mention_count: mentionCount,
            last_seen_run: idea.sourceRun,
          },
        });
      }
      continue;
    }

    // Create new idea node
    const nodeId = 'idea-' + String(nextId).padStart(3, '0');
    nextId++;

    const priority = computePriority(idea.impact, idea.effort, idea.risk);

    const newNode: KGNode = {
      id: nodeId,
      type: 'idea',
      title: idea.title,
      properties: {
        description: idea.description,
        impact: idea.impact,
        effort: idea.effort,
        risk: idea.risk,
        priority,
        status: 'proposed',
        source_run: idea.sourceRun,
        provenance: 'agent',
        group: idea.group,
        tags: [],
        mention_count: 1,
        last_seen_run: idea.sourceRun,
      },
      confidence: 0.5,
      scope: 'project-specific',
      model: null,
      created: now,
      updated: now,
    };

    result = addNode(result, newNode);
    seen.set(normalizedTitle, nodeId);

    // Create discovered_in edge to run node if it exists
    const runNode = result.nodes.find(
      (n) =>
        n.type === 'run' &&
        (n.id.includes(idea.sourceRun) ||
          n.properties.runId === idea.sourceRun),
    );
    if (runNode) {
      result = addEdge(result, {
        from: nodeId,
        to: runNode.id,
        type: 'discovered_in',
        metadata: {
          runId: idea.sourceRun,
          agent: 'backfill',
          timestamp: now,
        },
      });
    }
  }

  // Step 4: Link related ideas
  result = linkRelatedIdeas(result);

  return result;
}
