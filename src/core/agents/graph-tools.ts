import Anthropic from '@anthropic-ai/sdk';
import {
  loadGraph,
  saveGraph,
  findNodes,
  traverse,
  addNode,
  addEdge,
  updateNode,
  pprQuery,
  type KnowledgeGraph,
  type KGNode,
  type NodeType,
  type NodeScope,
  type EdgeType,
} from '../knowledge-graph.js';
import { semanticSearch } from '../semantic-search.js';
import { isEmbeddingAvailable } from '../embeddings.js';
import { type AuditEntry } from '../types.js';
import { findAuroraMatchesForNeuron, createCrossRef } from '../../aurora/cross-ref.js';

// ── Context & helpers ─────────────────────────────────────────────────

/** Context required for executing graph tools. */
export interface GraphToolContext {
  graphPath: string;
  runId: string;
  agent: string;
  model?: string;
  audit: { log: (entry: AuditEntry) => Promise<void> };
}

// ── Tool definitions (Anthropic tool schema) ──────────────────────────

/** Anthropic tool definitions for the 5 graph tools. */
export function graphToolDefinitions(): Anthropic.Tool[] {
  return [
    {
      name: 'graph_query',
      description:
        'Search the knowledge graph for nodes by type, keyword, or confidence threshold. ' +
        'Returns max 20 nodes sorted by confidence descending.',
      input_schema: {
        type: 'object' as const,
        properties: {
          type: {
            type: 'string',
            enum: ['pattern', 'error', 'technique', 'run', 'agent', 'idea'],
            description: 'Filter on node type',
          },
          query: {
            type: 'string',
            description: 'Free-text search in title + properties',
          },
          min_confidence: {
            type: 'number',
            description: 'Filter out nodes with lower confidence',
          },
          scope: {
            type: 'string',
            enum: ['universal', 'project-specific', 'unknown'],
            description: 'Filter nodes by scope. Omit to return all scopes.',
          },
        },
      },
    },
    {
      name: 'graph_traverse',
      description:
        'Follow edges from a node to find related nodes. Returns connected nodes.',
      input_schema: {
        type: 'object' as const,
        properties: {
          node_id: { type: 'string', description: 'Start node id' },
          edge_type: {
            type: 'string',
            enum: ['solves', 'discovered_in', 'related_to', 'causes', 'used_by', 'inspired_by'],
            description: 'Filter on edge type',
          },
          depth: {
            type: 'number',
            description: 'Traversal depth (default 1, max 3)',
          },
        },
        required: ['node_id'],
      },
    },
    {
      name: 'graph_assert',
      description:
        'Add a new node with optional edges to the knowledge graph. ' +
        'Auto-generates id and sets provenance metadata.',
      input_schema: {
        type: 'object' as const,
        properties: {
          node: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['pattern', 'error', 'technique', 'run', 'idea'],
              },
              title: { type: 'string' },
              properties: {
                type: 'object',
                description: 'Context, solution, effect, keywords, etc.',
              },
              confidence: { type: 'number', description: '0.0–1.0' },
              scope: {
                type: 'string',
                enum: ['universal', 'project-specific', 'unknown'],
                description: 'Scope of the node. Default: "unknown".',
              },
            },
            required: ['type', 'title', 'properties', 'confidence'],
          },
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                target_id: {
                  type: 'string',
                  description: 'Existing node to connect to',
                },
                type: {
                  type: 'string',
                  enum: [
                    'solves',
                    'discovered_in',
                    'related_to',
                    'causes',
                    'used_by',
                    'inspired_by',
                  ],
                },
              },
              required: ['target_id', 'type'],
            },
            description: 'Optional edges to existing nodes',
          },
        },
        required: ['node'],
      },
    },
    {
      name: 'graph_update',
      description:
        'Update an existing node in the knowledge graph. ' +
        'Properties are merged with existing (not replaced).',
      input_schema: {
        type: 'object' as const,
        properties: {
          node_id: { type: 'string', description: 'Node id to update' },
          confidence: { type: 'number', description: 'New confidence value' },
          properties: {
            type: 'object',
            description: 'Properties to merge with existing',
          },
          title: { type: 'string', description: 'New title' },
        },
        required: ['node_id'],
      },
    },
    {
      name: 'graph_semantic_search',
      description:
        'Search the knowledge graph using semantic similarity. Finds related nodes even without exact keyword matches. ' +
        'Requires pgvector + Ollama. Falls back gracefully if not available.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'Free-text query to find semantically similar nodes',
          },
          type: {
            type: 'string',
            enum: ['pattern', 'error', 'technique', 'run', 'agent', 'idea'],
            description: 'Filter on node type',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default 10)',
          },
          min_similarity: {
            type: 'number',
            description: 'Minimum similarity threshold 0-1 (default 0.7)',
          },
          scope: {
            type: 'string',
            enum: ['universal', 'project-specific', 'unknown'],
            description: 'Filter nodes by scope',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'graph_cross_ref',
      description:
        'Find Aurora knowledge nodes that are semantically related to a Neuron knowledge graph node. ' +
        'Automatically creates cross-references for matches with similarity >= 0.7.',
      input_schema: {
        type: 'object' as const,
        properties: {
          neuron_node_id: {
            type: 'string',
            description: 'The Neuron KG node ID to find Aurora matches for',
          },
          relationship: {
            type: 'string',
            enum: ['supports', 'contradicts', 'enriches', 'discovered_via'],
            description: 'Relationship type for created cross-refs (default: enriches)',
          },
        },
        required: ['neuron_node_id'],
      },
    },
    {
      name: 'graph_ppr',
      description:
        'Find related nodes using graph structure (Personalized PageRank). ' +
        'Starts from seed nodes and walks the graph — finds connections that keyword search misses.',
      input_schema: {
        type: 'object' as const,
        properties: {
          seed_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Node IDs to start from (at least 1)',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 10)',
          },
          type: {
            type: 'string',
            enum: ['pattern', 'error', 'technique', 'run', 'agent', 'idea'],
            description: 'Filter result type',
          },
          min_score: {
            type: 'number',
            description: 'Minimum PPR score threshold (default 0.01)',
          },
        },
        required: ['seed_ids'],
      },
    },
  ];
}

/** Check if a tool name is one of the graph tools. */
export function isGraphTool(name: string): boolean {
  return ['graph_query', 'graph_traverse', 'graph_assert', 'graph_update', 'graph_semantic_search', 'graph_cross_ref', 'graph_ppr'].includes(name);
}

/** Return only the read-only graph tools (query + traverse + semantic search). */
export function graphReadToolDefinitions(): Anthropic.Messages.Tool[] {
  return graphToolDefinitions().filter((t) =>
    ['graph_query', 'graph_traverse', 'graph_semantic_search', 'graph_ppr'].includes(t.name),
  );
}

// ── ID generation ─────────────────────────────────────────────────────

/** Generate the next available id for a given node type. */
function generateNextId(graph: KnowledgeGraph, nodeType: string): string {
  const existing = graph.nodes
    .filter((n) => n.type === nodeType)
    .map((n) => {
      const match = n.id.match(/-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });
  const maxNum = existing.length > 0 ? Math.max(...existing) : 0;
  return `${nodeType}-${String(maxNum + 1).padStart(3, '0')}`;
}

// ── Dispatcher ────────────────────────────────────────────────────────

/** Execute a graph tool by name, returns a result string. */
export async function executeGraphTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  switch (toolName) {
    case 'graph_query':
      return executeGraphQuery(input, ctx);
    case 'graph_traverse':
      return executeGraphTraverse(input, ctx);
    case 'graph_assert':
      return executeGraphAssert(input, ctx);
    case 'graph_update':
      return executeGraphUpdate(input, ctx);
    case 'graph_semantic_search':
      return executeGraphSemanticSearch(input, ctx);
    case 'graph_cross_ref':
      return executeGraphCrossRef(input, ctx);
    case 'graph_ppr':
      return executeGraphPpr(input, ctx);
    default:
      throw new Error(`Unknown graph tool: ${toolName}`);
  }
}

// ── Individual tool implementations ───────────────────────────────────

async function executeGraphQuery(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  const graph = await loadGraph(ctx.graphPath);
  const type = input.type as NodeType | undefined;
  const query = input.query as string | undefined;
  const minConfidence = input.min_confidence as number | undefined;
  const scope = input.scope as NodeScope | undefined;

  let results = findNodes(graph, { type, query, scope });

  if (minConfidence !== undefined) {
    results = results.filter((n) => n.confidence >= minConfidence);
  }

  results.sort((a, b) => b.confidence - a.confidence);
  results = results.slice(0, 20);

  await ctx.audit.log({
    ts: new Date().toISOString(),
    role: ctx.agent as AuditEntry['role'],
    tool: 'graph_query',
    allowed: true,
    note: `Query returned ${results.length} nodes`,
  });

  return JSON.stringify(results, null, 2);
}

async function executeGraphTraverse(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  const graph = await loadGraph(ctx.graphPath);
  const nodeId = input.node_id as string;
  const edgeType = input.edge_type as EdgeType | undefined;
  const depth = Math.min(Math.max((input.depth as number) || 1, 1), 3);

  const results = traverse(graph, nodeId, edgeType, depth);

  await ctx.audit.log({
    ts: new Date().toISOString(),
    role: ctx.agent as AuditEntry['role'],
    tool: 'graph_traverse',
    allowed: true,
    note: `Traversal from ${nodeId} returned ${results.length} nodes`,
  });

  return JSON.stringify(results, null, 2);
}

async function executeGraphAssert(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  let graph = await loadGraph(ctx.graphPath);
  const nodeInput = input.node as {
    type: NodeType;
    title: string;
    properties: Record<string, unknown>;
    confidence: number;
    scope?: NodeScope;
  };
  const edgesInput = (input.edges as Array<{ target_id: string; type: EdgeType }>) || [];

  const now = new Date().toISOString();
  const id = generateNextId(graph, nodeInput.type);

  const newNode: KGNode = {
    id,
    type: nodeInput.type,
    title: nodeInput.title,
    properties: {
      ...nodeInput.properties,
      provenance: {
        runId: ctx.runId,
        agent: ctx.agent,
        timestamp: now,
      },
    },
    created: now,
    updated: now,
    confidence: nodeInput.confidence,
    scope: nodeInput.scope || 'unknown',
    model: ctx.model,
  };

  graph = addNode(graph, newNode);

  for (const edge of edgesInput) {
    graph = addEdge(graph, {
      from: id,
      to: edge.target_id,
      type: edge.type,
      metadata: {
        runId: ctx.runId,
        agent: ctx.agent,
        timestamp: now,
      },
    });
  }

  await saveGraph(graph, ctx.graphPath);

  await ctx.audit.log({
    ts: new Date().toISOString(),
    role: ctx.agent as AuditEntry['role'],
    tool: 'graph_assert',
    allowed: true,
    note: `Node ${id} created with ${edgesInput.length} edges`,
  });

  return `Node ${id} created with ${edgesInput.length} edges`;
}

async function executeGraphUpdate(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  let graph = await loadGraph(ctx.graphPath);
  const nodeId = input.node_id as string;

  const existingNode = graph.nodes.find((n) => n.id === nodeId);
  if (!existingNode) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const updates: Partial<Pick<KGNode, 'confidence' | 'properties' | 'title'>> = {};

  if (input.confidence !== undefined) {
    updates.confidence = input.confidence as number;
  }
  if (input.title !== undefined) {
    updates.title = input.title as string;
  }
  if (input.properties !== undefined) {
    updates.properties = {
      ...existingNode.properties,
      ...(input.properties as Record<string, unknown>),
    };
  }

  graph = updateNode(graph, nodeId, updates);
  await saveGraph(graph, ctx.graphPath);

  await ctx.audit.log({
    ts: new Date().toISOString(),
    role: ctx.agent as AuditEntry['role'],
    tool: 'graph_update',
    allowed: true,
    note: `Node ${nodeId} updated`,
  });

  return `Node ${nodeId} updated`;
}

async function executeGraphSemanticSearch(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  // Check if semantic search is available
  const available = await isEmbeddingAvailable();
  if (!available) {
    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: ctx.agent as AuditEntry['role'],
      tool: 'graph_semantic_search',
      allowed: true,
      note: 'Semantic search not available (pgvector/Ollama not configured). Use graph_query instead.',
    });
    return JSON.stringify({
      results: [],
      message: 'Semantic search not available. pgvector extension or Ollama embedding model not configured. Use graph_query for keyword search.',
    });
  }

  const query = input.query as string;
  const type = input.type as string | undefined;
  const limit = input.limit as number | undefined;
  const minSimilarity = input.min_similarity as number | undefined;
  const scope = input.scope as string | undefined;

  try {
    const results = await semanticSearch(query, {
      type,
      limit,
      minSimilarity,
      scope,
    });

    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: ctx.agent as AuditEntry['role'],
      tool: 'graph_semantic_search',
      allowed: true,
      note: `Semantic search for "${query}" returned ${results.length} results`,
    });

    return JSON.stringify(results, null, 2);
  } catch (error) {
    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: ctx.agent as AuditEntry['role'],
      tool: 'graph_semantic_search',
      allowed: true,
      note: `Semantic search failed: ${error}`,
    });

    return JSON.stringify({
      results: [],
      message: `Semantic search failed: ${error}. Use graph_query for keyword search.`,
    });
  }
}

async function executeGraphCrossRef(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  const neuronNodeId = input.neuron_node_id as string;
  const relationship = (input.relationship as 'supports' | 'contradicts' | 'enriches' | 'discovered_via') || 'enriches';

  try {
    const matches = await findAuroraMatchesForNeuron(neuronNodeId, {
      limit: 5,
      minSimilarity: 0.5,
    });

    const crossRefsCreated: Array<{ auroraNodeId: string; similarity: number }> = [];

    for (const match of matches) {
      if (match.similarity >= 0.7) {
        await createCrossRef(
          neuronNodeId,
          match.node.id,
          relationship,
          match.similarity,
          { createdBy: ctx.agent, runId: ctx.runId },
          'historian-discovery',
        );
        crossRefsCreated.push({
          auroraNodeId: match.node.id,
          similarity: match.similarity,
        });
      }
    }

    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: ctx.agent as AuditEntry['role'],
      tool: 'graph_cross_ref',
      allowed: true,
      note: `Found ${matches.length} Aurora matches, created ${crossRefsCreated.length} cross-refs`,
    });

    return JSON.stringify({
      neuronNodeId,
      matches: matches.map(m => ({
        auroraNodeId: m.node.id,
        title: m.node.title,
        type: m.node.type,
        similarity: m.similarity,
        crossRefCreated: m.similarity >= 0.7,
      })),
      crossRefsCreated,
    }, null, 2);
  } catch (error) {
    await ctx.audit.log({
      ts: new Date().toISOString(),
      role: ctx.agent as AuditEntry['role'],
      tool: 'graph_cross_ref',
      allowed: true,
      note: `graph_cross_ref failed: ${error}`,
    });

    return JSON.stringify({
      neuronNodeId,
      matches: [],
      crossRefsCreated: [],
      error: `Failed to search Aurora: ${error instanceof Error ? error.message : error}`,
    });
  }
}

async function executeGraphPpr(
  input: Record<string, unknown>,
  ctx: GraphToolContext,
): Promise<string> {
  const graph = await loadGraph(ctx.graphPath);
  const seedIds = input.seed_ids as string[];
  const limit = input.limit as number | undefined;
  const type = input.type as NodeType | undefined;
  const minScore = input.min_score as number | undefined;

  // pprQuery throws on invalid input - let it propagate for agent tools
  const results = pprQuery(graph, seedIds, {
    limit: limit ? limit * 3 : 30,
    minScore,
  });

  // Filter by type if specified (post-filter since pprQuery only supports excludeTypes)
  const filtered = type ? results.filter(r => r.node.type === type) : results;
  const limited = filtered.slice(0, limit ?? 10);

  const output = limited.map(r => ({
    id: r.node.id,
    title: r.node.title,
    type: r.node.type,
    score: r.score,
    confidence: r.node.confidence,
  }));

  await ctx.audit.log({
    ts: new Date().toISOString(),
    role: ctx.agent as AuditEntry['role'],
    tool: 'graph_ppr',
    allowed: true,
    note: `PPR from ${seedIds.join(',')} returned ${output.length} nodes`,
  });

  return JSON.stringify(output, null, 2);
}
