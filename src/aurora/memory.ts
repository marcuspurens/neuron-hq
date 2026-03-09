import crypto from 'crypto';
import {
  loadAuroraGraph,
  saveAuroraGraph,
  addAuroraNode,
  addAuroraEdge,
  updateAuroraNode,
  findAuroraNodes,
  traverseAurora,
} from './aurora-graph.js';
import { searchAurora } from './search.js';
import type { AuroraNode, AuroraGraph, AuroraEdgeType } from './aurora-schema.js';

// --- Interfaces ---

export interface RememberOptions {
  type?: 'fact' | 'preference';
  scope?: 'personal' | 'shared' | 'project';
  tags?: string[];
  source?: string;
  dedupThreshold?: number;
}

export interface RememberResult {
  nodeId: string;
  action: 'created' | 'updated' | 'duplicate';
  existingNodeId?: string;
  similarity?: number;
}

export interface RecallOptions {
  limit?: number;
  type?: 'fact' | 'preference';
  scope?: 'personal' | 'shared' | 'project';
  minSimilarity?: number;
}

export interface RecallResult {
  memories: Memory[];
  totalFound: number;
}

export interface Memory {
  id: string;
  title: string;
  type: 'fact' | 'preference';
  text: string;
  confidence: number;
  scope: string;
  tags: string[];
  similarity: number | null;
  related: { id: string; title: string; edgeType: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryStats {
  facts: number;
  preferences: number;
  total: number;
  avgConfidence: number;
  byScope: Record<string, number>;
}

// --- Helpers ---

/** Generate a short title from text, truncating at word boundary if needed. */
function generateTitle(text: string): string {
  const maxLen = 60;
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 20 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
}

/** Find the edge type connecting two nodes. */
function findEdgeType(
  graph: AuroraGraph,
  nodeIdA: string,
  nodeIdB: string,
): string {
  const edge = graph.edges.find(
    (e) =>
      (e.from === nodeIdA && e.to === nodeIdB) ||
      (e.from === nodeIdB && e.to === nodeIdA),
  );
  return edge?.type ?? 'related_to';
}

/** Convert an AuroraNode + search similarity into a Memory object. */
function nodeToMemory(
  node: AuroraNode,
  graph: AuroraGraph,
  similarity: number | null,
): Memory | null {
  if (node.type !== 'fact' && node.type !== 'preference') return null;

  const traversed = traverseAurora(graph, node.id, undefined, 1);
  const related = traversed.map((n) => ({
    id: n.id,
    title: n.title,
    edgeType: findEdgeType(graph, node.id, n.id),
  }));

  const tags = Array.isArray(node.properties.tags)
    ? (node.properties.tags as string[])
    : [];

  const text =
    typeof node.properties.text === 'string'
      ? node.properties.text
      : node.title;

  return {
    id: node.id,
    title: node.title,
    type: node.type,
    text,
    confidence: node.confidence,
    scope: node.scope as string,
    tags,
    similarity,
    related,
    createdAt: node.created,
    updatedAt: node.updated,
  };
}

// --- Core Functions ---

/**
 * Store a memory in the Aurora knowledge graph.
 * Performs deduplication: near-exact matches are skipped, similar
 * matches are updated with boosted confidence, otherwise a new
 * node is created.
 */
export async function remember(
  text: string,
  options?: RememberOptions,
): Promise<RememberResult> {
  const type = options?.type ?? 'fact';
  const scope = options?.scope ?? 'personal';
  const dedupThreshold = options?.dedupThreshold ?? 0.85;

  // Step 1: Dedup search
  let candidates: { id: string; similarity: number | null }[] = [];

  try {
    const searchResults = await searchAurora(text, {
      type,
      limit: 5,
      minSimilarity: 0.5,
    });
    candidates = searchResults.map((r) => ({
      id: r.id,
      similarity: r.similarity,
    }));
  } catch {
    // Fallback to keyword search
    const graph = await loadAuroraGraph();
    const found = findAuroraNodes(graph, { type, query: text });
    candidates = found.map((n) => ({
      id: n.id,
      similarity: null,
    }));
  }

  // Step 2: Check best candidate
  const best = candidates[0];
  if (best && best.similarity !== null) {
    if (best.similarity >= 0.95) {
      return {
        action: 'duplicate',
        nodeId: best.id,
        existingNodeId: best.id,
        similarity: best.similarity,
      };
    }

    if (best.similarity >= dedupThreshold) {
      let graph = await loadAuroraGraph();
      const existingNode = graph.nodes.find((n) => n.id === best.id);
      if (existingNode) {
        graph = updateAuroraNode(graph, best.id, {
          confidence: Math.min(1, existingNode.confidence + 0.1),
          properties: {
            ...existingNode.properties,
            text,
            updatedAt: new Date().toISOString(),
          },
        });
        await saveAuroraGraph(graph);
        return {
          action: 'updated',
          nodeId: best.id,
          existingNodeId: best.id,
          similarity: best.similarity,
        };
      }
    }
  }

  // Step 3: Create new node
  let graph = await loadAuroraGraph();
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  const node: AuroraNode = {
    id: newId,
    type,
    title: generateTitle(text),
    properties: {
      text,
      tags: options?.tags ?? [],
      source: options?.source ?? null,
    },
    confidence: 0.7,
    scope,
    created: now,
    updated: now,
  };

  graph = addAuroraNode(graph, node);

  // Step 4: Create related_to edges for similar (but not duplicate) results
  const relatedCandidates = candidates.filter(
    (c) =>
      c.similarity !== null &&
      c.similarity >= 0.5 &&
      c.similarity < dedupThreshold,
  );

  for (const candidate of relatedCandidates) {
    const edgeType: AuroraEdgeType = 'related_to';
    graph = addAuroraEdge(graph, {
      from: newId,
      to: candidate.id,
      type: edgeType,
      metadata: {
        createdBy: 'memory',
        timestamp: now,
      },
    });
  }

  // Step 5: Save
  await saveAuroraGraph(graph);

  return {
    action: 'created',
    nodeId: newId,
  };
}

/**
 * Recall memories from the Aurora knowledge graph matching a query.
 * Uses semantic search with enrichment from graph traversal.
 */
export async function recall(
  query: string,
  options?: RecallOptions,
): Promise<RecallResult> {
  const limit = options?.limit ?? 10;
  const minSimilarity = options?.minSimilarity ?? 0.3;

  const searchResults = await searchAurora(query, {
    type: options?.type,
    scope: options?.scope,
    limit,
    minSimilarity,
  });

  const graph = await loadAuroraGraph();

  const memories: Memory[] = [];
  for (const result of searchResults) {
    const node = graph.nodes.find((n) => n.id === result.id);
    if (!node) continue;

    const memory = nodeToMemory(node, graph, result.similarity);
    if (memory) memories.push(memory);
  }

  return {
    memories,
    totalFound: memories.length,
  };
}

/**
 * Compute statistics about memories stored in the Aurora knowledge graph.
 */
export async function memoryStats(): Promise<MemoryStats> {
  const graph = await loadAuroraGraph();

  const memoryNodes = graph.nodes.filter(
    (n) => n.type === 'fact' || n.type === 'preference',
  );

  const facts = memoryNodes.filter((n) => n.type === 'fact').length;
  const preferences = memoryNodes.filter((n) => n.type === 'preference').length;
  const total = memoryNodes.length;

  const avgConfidence =
    total > 0
      ? memoryNodes.reduce((sum, n) => sum + n.confidence, 0) / total
      : 0;

  const byScope: Record<string, number> = {};
  for (const node of memoryNodes) {
    byScope[node.scope] = (byScope[node.scope] ?? 0) + 1;
  }

  return {
    facts,
    preferences,
    total,
    avgConfidence,
    byScope,
  };
}
