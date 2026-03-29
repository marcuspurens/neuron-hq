import fs from 'fs/promises';
import path from 'path';
import { getPool, isDbAvailable } from '../core/db.js';
import { isEmbeddingAvailable, getEmbeddingProvider } from '../core/embeddings.js';
import {
  AuroraNodeSchema,
  AuroraEdgeSchema,
  AuroraGraphSchema,
  type AuroraNode,
  type AuroraEdge,
  type AuroraGraph,
  type AuroraNodeType,
  type AuroraScope,
  type AuroraEdgeType,
} from './aurora-schema.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:graph');

/** Internal sleep helper for retry backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Default path ---
const DEFAULT_GRAPH_PATH = path.resolve(import.meta.dirname ?? '.', '../../aurora/graph.json');

// --- CRUD Operations ---

/** Create a new empty Aurora graph. */
export function createEmptyAuroraGraph(): AuroraGraph {
  return {
    nodes: [],
    edges: [],
    lastUpdated: new Date().toISOString(),
  };
}

/** Add a node to the Aurora graph. Returns a new graph. Throws on duplicate id. */
export function addAuroraNode(graph: AuroraGraph, node: AuroraNode): AuroraGraph {
  const validated = AuroraNodeSchema.parse(node);
  if (graph.nodes.some((n) => n.id === validated.id)) {
    throw new Error(`Duplicate node id: ${validated.id}`);
  }
  return {
    ...graph,
    nodes: [...graph.nodes, validated],
    lastUpdated: new Date().toISOString(),
  };
}

/** Add an edge to the Aurora graph. Returns a new graph. Throws if from/to nodes don't exist. */
export function addAuroraEdge(graph: AuroraGraph, edge: AuroraEdge): AuroraGraph {
  const validated = AuroraEdgeSchema.parse(edge);
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

/** Find nodes matching optional type, query string, and scope filter. */
export function findAuroraNodes(
  graph: AuroraGraph,
  filter: { type?: AuroraNodeType; query?: string; scope?: AuroraScope }
): AuroraNode[] {
  return graph.nodes.filter((node) => {
    if (filter.type && node.type !== filter.type) return false;
    if (filter.scope && node.scope !== filter.scope) return false;
    if (filter.query) {
      const q = filter.query.toLowerCase();
      const inTitle = node.title.toLowerCase().includes(q);
      const inProps = Object.values(node.properties).some((v) =>
        String(v).toLowerCase().includes(q)
      );
      if (!inTitle && !inProps) return false;
    }
    return true;
  });
}

/** Update a node's confidence, properties, and/or title. Throws if node not found. */
export function updateAuroraNode(
  graph: AuroraGraph,
  id: string,
  updates: Partial<Pick<AuroraNode, 'confidence' | 'properties' | 'title'>>
): AuroraGraph {
  const idx = graph.nodes.findIndex((n) => n.id === id);
  if (idx === -1) throw new Error(`Node not found: ${id}`);
  const node = graph.nodes[idx];
  const updatedNode: AuroraNode = {
    ...node,
    ...updates,
    updated: new Date().toISOString(),
  };
  const nodes = [...graph.nodes];
  nodes[idx] = updatedNode;
  return { ...graph, nodes, lastUpdated: new Date().toISOString() };
}

/** Remove a node and all connected edges. Throws if node not found. */
export function removeAuroraNode(graph: AuroraGraph, id: string): AuroraGraph {
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

/** Apply confidence decay to nodes not updated recently. */
export function applyAuroraConfidenceDecay(
  graph: AuroraGraph,
  options?: { inactiveDays?: number; decayFactor?: number }
): AuroraGraph {
  const inactiveDays = options?.inactiveDays ?? 20;
  const decayFactor = options?.decayFactor ?? 0.9;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - inactiveDays);

  const nodes = graph.nodes.map((node) => {
    const updatedDate = new Date(node.updated);
    if (updatedDate < cutoff) {
      const newConfidence = Math.max(0, node.confidence * decayFactor);
      return {
        ...node,
        confidence: Math.round(newConfidence * 1000) / 1000,
      };
    }
    return node;
  });
  return { ...graph, nodes, lastUpdated: new Date().toISOString() };
}

/** BFS traverse through Aurora edges from a start node. */
export function traverseAurora(
  graph: AuroraGraph,
  startId: string,
  edgeType?: AuroraEdgeType,
  depth: number = 3
): AuroraNode[] {
  const visited = new Set<string>([startId]);
  let frontier = [startId];
  const result: AuroraNode[] = [];

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const nextFrontier: string[] = [];
    for (const nodeId of frontier) {
      const neighbors = graph.edges
        .filter((e) => {
          const connected = e.from === nodeId || e.to === nodeId;
          if (!connected) return false;
          if (edgeType && e.type !== edgeType) return false;
          return true;
        })
        .map((e) => (e.from === nodeId ? e.to : e.from));

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          nextFrontier.push(neighborId);
          const node = graph.nodes.find((n) => n.id === neighborId);
          if (node) result.push(node);
        }
      }
    }
    frontier = nextFrontier;
  }
  return result;
}

// --- DB helpers ---

/** Load Aurora graph from Postgres. Returns null if loading fails. */
export async function loadAuroraGraphFromDb(): Promise<AuroraGraph | null> {
  try {
    const pool = getPool();

    const { rows: nodeRows } = await pool.query(
      'SELECT id, type, title, properties, confidence, scope, source_url, created, updated FROM aurora_nodes'
    );

    const { rows: edgeRows } = await pool.query(
      'SELECT from_id, to_id, type, metadata FROM aurora_edges'
    );

    const nodes: AuroraNode[] = nodeRows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      type: r.type as AuroraNodeType,
      title: r.title as string,
      properties: (r.properties ?? {}) as Record<string, unknown>,
      confidence: r.confidence as number,
      scope: (r.scope ?? 'personal') as AuroraNode['scope'],
      sourceUrl: (r.source_url as string) ?? null,
      created: (r.created as Date).toISOString(),
      updated: (r.updated as Date).toISOString(),
    }));

    const edges: AuroraEdge[] = edgeRows.map((r: Record<string, unknown>) => ({
      from: r.from_id as string,
      to: r.to_id as string,
      type: r.type as AuroraEdgeType,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    }));

    return {
      nodes,
      edges,
      lastUpdated: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn('Warning: Failed to load Aurora graph from DB', { error: String(err) });
    return null;
  }
}

/** Save Aurora graph to Postgres (upsert all nodes and edges). Batch operations. */
export async function saveAuroraGraphToDb(graph: AuroraGraph): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Batch upsert nodes (single INSERT ... ON CONFLICT)
    if (graph.nodes.length > 0) {
      const COLS = 9;
      const values: unknown[] = [];
      const placeholders: string[] = [];
      for (let i = 0; i < graph.nodes.length; i++) {
        const n = graph.nodes[i];
        const o = i * COLS;
        placeholders.push(
          `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9})`
        );
        values.push(
          n.id,
          n.type,
          n.title,
          JSON.stringify(n.properties),
          n.confidence,
          n.scope ?? 'personal',
          n.sourceUrl ?? null,
          n.created,
          n.updated
        );
      }
      await client.query(
        `INSERT INTO aurora_nodes (id, type, title, properties, confidence, scope, source_url, created, updated)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type, title = EXCLUDED.title,
           properties = EXCLUDED.properties, confidence = EXCLUDED.confidence,
           scope = EXCLUDED.scope, source_url = EXCLUDED.source_url,
           updated = EXCLUDED.updated`,
        values
      );
    }

    // 2. Delete stale edges (batch, before removing nodes they reference)
    if (graph.edges.length > 0) {
      const fromIds = graph.edges.map((e) => e.from);
      const toIds = graph.edges.map((e) => e.to);
      const edgeTypes = graph.edges.map((e) => e.type);
      await client.query(
        `DELETE FROM aurora_edges e
         WHERE NOT EXISTS (
           SELECT 1 FROM unnest($1::text[], $2::text[], $3::text[]) AS v(f, t, tp)
           WHERE e.from_id = v.f AND e.to_id = v.t AND e.type = v.tp
         )`,
        [fromIds, toIds, edgeTypes]
      );
    } else {
      await client.query('DELETE FROM aurora_edges');
    }

    // 3. Batch upsert edges (single INSERT ... ON CONFLICT)
    if (graph.edges.length > 0) {
      const COLS = 4;
      const values: unknown[] = [];
      const placeholders: string[] = [];
      for (let i = 0; i < graph.edges.length; i++) {
        const e = graph.edges[i];
        const o = i * COLS;
        placeholders.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`);
        values.push(e.from, e.to, e.type, JSON.stringify(e.metadata));
      }
      await client.query(
        `INSERT INTO aurora_edges (from_id, to_id, type, metadata)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (from_id, to_id, type) DO UPDATE SET
           metadata = EXCLUDED.metadata`,
        values
      );
    }

    // 4. Delete stale nodes (batch)
    if (graph.nodes.length > 0) {
      const nodeIds = graph.nodes.map((n) => n.id);
      await client.query('DELETE FROM aurora_nodes WHERE id != ALL($1::text[])', [nodeIds]);
    } else {
      await client.query('DELETE FROM aurora_nodes');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Generate embeddings for Aurora nodes that don't have them yet. Non-fatal. */
export async function autoEmbedAuroraNodes(nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) return;
  try {
    if (!(await isEmbeddingAvailable())) return;

    const pool = getPool();
    const provider = getEmbeddingProvider();

    const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT id, type, title, properties FROM aurora_nodes WHERE id IN (${placeholders}) AND embedding IS NULL`,
      nodeIds
    );

    // Build texts for all nodes — truncate to avoid Ollama 400 errors
    // snowflake-arctic-embed has ~512 token limit; ~2000 chars is safe
    const MAX_EMBED_CHARS = 2000;
    const texts = rows.map((node: Record<string, unknown>) => {
      const props = node.properties as Record<string, unknown> | undefined;
      const textContent = typeof props?.text === 'string' ? props.text : '';
      const full = `${node.type}: ${node.title}. ${textContent}`;
      return full.length > MAX_EMBED_CHARS ? full.slice(0, MAX_EMBED_CHARS) : full;
    });

    // Process in batches of 20 with retry
    const BATCH_SIZE = 20;
    const MAX_RETRIES = 2;
    const BACKOFF_BASE_MS = 2000;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + BATCH_SIZE);
      const batchRows = rows.slice(i, i + BATCH_SIZE);
      const batchIds = batchRows.map((r: Record<string, unknown>) => r.id as string);

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const embeddings = await provider.embedBatch(batchTexts);
          const ids = batchIds;
          const vectors = embeddings.map((e: number[]) => `[${e.join(',')}]`);

          await pool.query(
            `UPDATE aurora_nodes AS n
             SET embedding = v.emb::vector
             FROM unnest($1::text[], $2::text[]) AS v(id, emb)
             WHERE n.id = v.id`,
            [ids, vectors]
          );
          break;
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
            logger.warn(
              `Embedding batch failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delayMs}ms...`,
              { i, error: String(err) }
            );
            await sleep(delayMs);
          } else {
            logger.error(
              `Embedding batch failed after ${MAX_RETRIES + 1} attempts. Nodes missing embedding:`,
              { nodeIds: batchIds, error: String(err) }
            );
          }
        }
      }
    }
  } catch (err) {
    logger.warn('Warning: Auto-embed Aurora nodes failed', { error: String(err) });
  }
}

// --- Load / Save ---

/** Load Aurora graph from DB (preferred) or JSON file (fallback). */
export async function loadAuroraGraph(filePath: string = DEFAULT_GRAPH_PATH): Promise<AuroraGraph> {
  // Try loading from DB first
  if (await isDbAvailable()) {
    const dbGraph = await loadAuroraGraphFromDb();
    if (dbGraph && dbGraph.nodes.length > 0) {
      return dbGraph;
    }
  }

  // Fallback to file
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data: unknown = JSON.parse(raw);
    return AuroraGraphSchema.parse(data);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return createEmptyAuroraGraph();
    }
    throw err;
  }
}

/** Save Aurora graph to file (always) and DB (if available). Dual-write with auto-embed. */
export async function saveAuroraGraph(
  graph: AuroraGraph,
  filePath: string = DEFAULT_GRAPH_PATH
): Promise<void> {
  // Always save to file (primary/backup)
  const validated = AuroraGraphSchema.parse(graph);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(validated, null, 2), 'utf-8');

  // Also save to DB if available (dual write)
  try {
    if (await isDbAvailable()) {
      await saveAuroraGraphToDb(validated);
      // Auto-embed new/updated nodes
      const nodeIds = validated.nodes.map((n) => n.id);
      await autoEmbedAuroraNodes(nodeIds);
    }
  } catch (err) {
    logger.warn('DB write failed during saveAuroraGraph (file backup exists)', {
      error: String(err),
    });
  }
}
