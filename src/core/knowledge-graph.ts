import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

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

/**
 * Load a knowledge graph from a JSON file.
 * Returns an empty graph if the file does not exist.
 */
export async function loadGraph(
  filePath: string = DEFAULT_GRAPH_PATH,
): Promise<KnowledgeGraph> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data: unknown = JSON.parse(raw);
    // Parse with scope defaulting to 'unknown' for existing nodes
    const graph = KnowledgeGraphSchema.parse(data);
    // Migrate nodes that might not have scope (from old files)
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
 * Save a knowledge graph to a JSON file.
 * Validates with Zod before writing.
 */
export async function saveGraph(
  graph: KnowledgeGraph,
  filePath: string = DEFAULT_GRAPH_PATH,
): Promise<void> {
  const validated = KnowledgeGraphSchema.parse(graph);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(validated, null, 2), 'utf-8');
}

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
