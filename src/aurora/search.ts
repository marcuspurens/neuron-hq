import { semanticSearch } from '../core/semantic-search.js';
import { loadAuroraGraph, findAuroraNodes, traverseAurora } from './aurora-graph.js';
import { personalizedPageRank } from '../core/ppr.js';
import type { AuroraGraph, AuroraNodeType, AuroraScope } from './aurora-schema.js';
import { AURORA_SIMILARITY } from './llm-defaults.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:search');

export interface SearchOptions {
  limit?: number; // Default: 10
  minSimilarity?: number; // Default: 0.3
  type?: string; // Filter node type
  scope?: string; // Filter scope
  includeRelated?: boolean; // Default: true
  traversalDepth?: number; // Default: 1
  usePpr?: boolean; // Default: true — expand results via PPR graph traversal
  pprLimit?: number; // Default: 5 — max PPR-discovered nodes to add
}

export interface SearchResult {
  id: string;
  title: string;
  type: string;
  similarity: number | null; // null if found via traversal/keyword
  confidence: number;
  scope: string;
  text?: string; // From properties.text
  source: 'semantic' | 'keyword' | 'traversal' | 'ppr';
  related?: { id: string; title: string; edgeType: string }[];
}

/**
 * Find the edge type connecting two nodes in the graph.
 * Checks both directions (from→to and to→from).
 */
function findEdgeType(graph: AuroraGraph, nodeIdA: string, nodeIdB: string): string | undefined {
  const edge = graph.edges.find(
    (e) => (e.from === nodeIdA && e.to === nodeIdB) || (e.from === nodeIdB && e.to === nodeIdA)
  );
  return edge?.type;
}

/**
 * Build the related-nodes array for a given result node.
 * Finds all edges connected to the node and maps them to
 * `{ id, title, edgeType }` entries.
 */
function buildRelated(
  graph: AuroraGraph,
  nodeId: string,
  depth: number
): { id: string; title: string; edgeType: string }[] {
  const traversed = traverseAurora(graph, nodeId, undefined, depth);
  return traversed.map((n) => ({
    id: n.id,
    title: n.title,
    edgeType: findEdgeType(graph, nodeId, n.id) ?? 'related_to',
  }));
}

/**
 * Add parent documents for chunk nodes connected via 'derived_from' edges.
 * If a result node has a derived_from edge, its parent is added to the
 * related array (if not already present).
 */
function addParentDocuments(
  graph: AuroraGraph,
  nodeId: string,
  related: { id: string; title: string; edgeType: string }[]
): { id: string; title: string; edgeType: string }[] {
  const relatedIds = new Set(related.map((r) => r.id));

  const parentEdges = graph.edges.filter((e) => e.from === nodeId && e.type === 'derived_from');

  for (const edge of parentEdges) {
    if (!relatedIds.has(edge.to)) {
      const parent = graph.nodes.find((n) => n.id === edge.to);
      if (parent) {
        related.push({
          id: parent.id,
          title: parent.title,
          edgeType: 'derived_from',
        });
      }
    }
  }

  return related;
}

/**
 * Extract the text property from node properties, if present.
 */
function extractText(properties: Record<string, unknown>): string | undefined {
  if (typeof properties.text === 'string') {
    return properties.text;
  }
  return undefined;
}

function expandViaPpr(
  graph: AuroraGraph,
  seedResults: SearchResult[],
  existingIds: Set<string>,
  pprLimit: number,
  typeFilter?: string,
  scopeFilter?: string
): SearchResult[] {
  if (seedResults.length === 0 || graph.nodes.length < 2) return [];

  const seeds = new Map<string, number>();
  for (const r of seedResults) {
    seeds.set(r.id, r.similarity ?? 0.5);
  }

  const nodeIds = graph.nodes.map((n) => n.id);
  const edges = graph.edges.flatMap((e) => [
    { from: e.from, to: e.to },
    { from: e.to, to: e.from },
  ]);

  try {
    const pprResults = personalizedPageRank(nodeIds, edges, seeds);

    const expanded: SearchResult[] = [];
    for (const pr of pprResults) {
      if (existingIds.has(pr.nodeId)) continue;
      if (expanded.length >= pprLimit) break;

      const node = graph.nodes.find((n) => n.id === pr.nodeId);
      if (!node) continue;
      if (typeFilter && node.type !== typeFilter) continue;
      if (scopeFilter && node.scope !== scopeFilter) continue;

      expanded.push({
        id: node.id,
        title: node.title,
        type: node.type,
        similarity: null,
        confidence: node.confidence,
        scope: node.scope,
        source: 'ppr',
      });
      existingIds.add(node.id);
    }
    return expanded;
  } catch (err) {
    logger.warn('[search] PPR expansion failed, skipping', { error: String(err) });
    return [];
  }
}

/**
 * Search Aurora knowledge graph with semantic search (preferred)
 * and keyword fallback. Optionally enriches results with related
 * nodes found via graph traversal.
 */
export async function searchAurora(
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  const limit = options?.limit ?? 10;
  const minSimilarity = options?.minSimilarity ?? AURORA_SIMILARITY.searchLoose;
  const includeRelated = options?.includeRelated ?? true;
  const traversalDepth = options?.traversalDepth ?? 1;
  const type = options?.type;
  const scope = options?.scope;

  let results: SearchResult[] = [];
  let cachedGraph: AuroraGraph | null = null;

  // Step 1: Try semantic search
  try {
    const semanticResults = await semanticSearch(query, {
      table: 'aurora_nodes',
      type,
      scope,
      limit,
      minSimilarity,
    });

    results = semanticResults.map((sr) => ({
      id: sr.id,
      title: sr.title,
      type: sr.type,
      similarity: sr.similarity,
      confidence: sr.confidence,
      scope: sr.scope,
      source: 'semantic' as const,
    }));
  } catch (err) {
    logger.error('[search] search failed', { error: String(err) });
    cachedGraph = await loadAuroraGraph();
    const keywordResults = findAuroraNodes(cachedGraph, {
      type: type as AuroraNodeType | undefined,
      query,
      scope: scope as AuroraScope | undefined,
    });

    results = keywordResults.slice(0, limit).map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      similarity: null,
      confidence: node.confidence,
      scope: node.scope,
      source: 'keyword' as const,
    }));
  }

  // Step 2: PPR expansion — use semantic results as seeds, spread through graph
  const usePpr = options?.usePpr ?? true;
  const pprLimit = options?.pprLimit ?? 5;

  if (usePpr && results.length > 0) {
    cachedGraph = cachedGraph ?? (await loadAuroraGraph());
    const existingIds = new Set(results.map((r) => r.id));
    const pprExpanded = expandViaPpr(cachedGraph, results, existingIds, pprLimit, type, scope);
    if (pprExpanded.length > 0) {
      results.push(...pprExpanded);
      logger.debug('[search] PPR expanded results', { added: pprExpanded.length });
    }
  }

  // Step 3: Enrich with related nodes via graph traversal
  if (includeRelated && results.length > 0) {
    const graph = cachedGraph ?? (await loadAuroraGraph());

    const resultIds = new Set(results.map((r) => r.id));

    for (const result of results) {
      let related = buildRelated(graph, result.id, traversalDepth);

      // Add parent documents for chunks
      related = addParentDocuments(graph, result.id, related);

      if (related.length > 0) {
        result.related = related;
      }

      // Extract text from graph node properties
      const graphNode = graph.nodes.find((n) => n.id === result.id);
      if (graphNode) {
        const text = extractText(graphNode.properties);
        if (text) {
          result.text = text;
        }
      }
    }

    // Step 4: Dedup — remove traversal nodes that also appear as primary results
    // (traversal results only appear in `related` arrays, so we filter them out there)
    for (const result of results) {
      if (result.related) {
        result.related = result.related.filter((r) => !resultIds.has(r.id));
        if (result.related.length === 0) {
          delete result.related;
        }
      }
    }
  } else {
    // Even without related, still extract text from graph
    const graph = await loadAuroraGraph();
    for (const result of results) {
      const graphNode = graph.nodes.find((n) => n.id === result.id);
      if (graphNode) {
        const text = extractText(graphNode.properties);
        if (text) {
          result.text = text;
        }
      }
    }
  }

  // Step 5: Sort — by similarity desc, then confidence desc for null-similarity
  results.sort((a, b) => {
    if (a.similarity !== null && b.similarity !== null) {
      return b.similarity - a.similarity;
    }
    if (a.similarity !== null && b.similarity === null) return -1;
    if (a.similarity === null && b.similarity !== null) return 1;
    return b.confidence - a.confidence;
  });

  return results;
}
