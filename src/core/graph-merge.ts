import { z } from 'zod';
import type { KnowledgeGraph, KGNode, KGEdge, NodeType } from './knowledge-graph.js';
import { createLogger } from './logger.js';
import { personalizedPageRank, type PPRResult } from './ppr.js';

const logger = createLogger('graph-merge');

// --- Merge Proposal Schema ---

export const MergeProposalSchema = z.object({
  keepNodeId: z.string().describe('ID of the node to keep (canonical)'),
  removeNodeId: z.string().describe('ID of the node to merge into keepNodeId'),
  mergedTitle: z.string().describe('Combined/improved title for the kept node'),
  reason: z.string().describe('Why these nodes are duplicates'),
});
export type MergeProposal = z.infer<typeof MergeProposalSchema>;

// --- Constants ---

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'and', 'or', 'is', 'are', 'was', 'were',
]);

// --- Helpers ---

/**
 * Normalize a title by lowercasing, removing stop words,
 * trimming, and collapsing whitespace.
 */
export function normalizeTitle(title: string): string {
  const lower = title.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  return words.join(' ').trim();
}

/**
 * Compute Jaccard similarity between two strings based on word tokens.
 * Returns |intersection| / |union|, or 0 if both are empty.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter((w) => w.length > 0));
  const setB = new Set(b.split(/\s+/).filter((w) => w.length > 0));

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// --- Core Functions ---

/**
 * Find pairs of nodes of the same type whose normalized titles
 * have Jaccard similarity >= the given threshold.
 * Returns pairs sorted by similarity descending.
 * When usePpr is true, applies PPR-boost hybrid scoring to top 50 candidates.
 */
export function findDuplicateCandidates(
  graph: KnowledgeGraph,
  similarityThreshold: number = 0.6,
  options?: { usePpr?: boolean },
): Array<{ nodeA: string; nodeB: string; similarity: number }> {
  const results: Array<{ nodeA: string; nodeB: string; similarity: number }> = [];
  const { nodes } = graph;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.type !== b.type) continue;

      const sim = jaccardSimilarity(normalizeTitle(a.title), normalizeTitle(b.title));
      if (sim >= similarityThreshold) {
        results.push({ nodeA: a.id, nodeB: b.id, similarity: sim });
      }
    }
  }

  // PPR-boost: only if usePpr is true and there are candidates
  if (options?.usePpr && results.length > 0) {
    const PPR_BATCH_LIMIT = 50;

    // Sort by Jaccard score descending, take top 50 for PPR-boost
    results.sort((a, b) => b.similarity - a.similarity);
    const toBoost = results.slice(0, PPR_BATCH_LIMIT);
    const skipBoost = results.slice(PPR_BATCH_LIMIT);

    // Adapt graph for PPR
    const nodeIds = graph.nodes.map((n) => n.id);
    const edges = graph.edges.map((e) => ({ from: e.from, to: e.to }));

    // Apply PPR-boost to top-50 candidates
    const boosted: Array<{ nodeA: string; nodeB: string; similarity: number }> = [];
    for (const candidate of toBoost) {
      let pprProximity = 0;
      let pprFailed = false;
      try {
        // Run PPR from nodeA, get normalized score for nodeB
        const seeds = new Map([[candidate.nodeA, 1.0]]);
        const rawResults: PPRResult[] = personalizedPageRank(nodeIds, edges, seeds);
        const maxScore = rawResults.reduce((max, r) => Math.max(max, r.score), 0);
        if (maxScore >= 1e-6) {
          const nodeBResult = rawResults.find((r) => r.nodeId === candidate.nodeB);
          if (nodeBResult) {
            pprProximity = nodeBResult.score / maxScore;
          }
        }
        // If maxScore < 1e-6: epsilon guard → pprProximity stays 0
      } catch {
        pprFailed = true;
        console.warn(`[graph-merge] PPR-boost failed for pair ${candidate.nodeA}/${candidate.nodeB}, using Jaccard score`);
      }

      const finalScore = pprFailed
        ? candidate.similarity  // fallback to Jaccard if PPR throws
        : candidate.similarity * 0.6 + pprProximity * 0.4;

      boosted.push({ ...candidate, similarity: finalScore });
    }

    // Rebuild: boosted (with PPR) + skipBoost (Jaccard-only) sorted by similarity desc
    const finalResults = [...boosted, ...skipBoost].sort((a, b) => b.similarity - a.similarity);
    return finalResults;
  }

  // Without PPR: sort and return as before
  return results.sort((x, y) => y.similarity - x.similarity);
}

/**
 * Find related nodes using Personalized PageRank from a seed node.
 * Returns nodes ranked by PPR score, optionally excluding direct neighbors.
 * Throws Error if nodeId not found in graph.
 * Returns empty array if graph has < 2 nodes or seed node has no edges.
 */
export function findPprCandidates(
  graph: KnowledgeGraph,
  nodeId: string,
  options?: { limit?: number; excludeDirectNeighbors?: boolean },
): Array<{ node: KGNode; score: number }> {
  const limit = options?.limit ?? 10;
  const excludeDirectNeighbors = options?.excludeDirectNeighbors ?? true;

  // Throw if nodeId not found (follows mergeNodes() convention)
  const seedNode = graph.nodes.find((n) => n.id === nodeId);
  if (!seedNode) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  // Return empty array if graph has < 2 nodes
  if (graph.nodes.length < 2) {
    return [];
  }

  // Check if seed node has any edges (isolated node → no PPR traversal possible)
  const hasEdges = graph.edges.some((e) => e.from === nodeId || e.to === nodeId);
  if (!hasEdges) {
    return [];
  }

  // Adapt KnowledgeGraph to personalizedPageRank() format
  const nodes = graph.nodes.map((n) => n.id);
  const edges = graph.edges.map((e) => ({ from: e.from, to: e.to }));
  const seeds = new Map([[nodeId, 1.0]]);

  const pprResults: PPRResult[] = personalizedPageRank(nodes, edges, seeds);

  // Build set of direct neighbors for optional exclusion
  const directNeighbors = new Set<string>();
  if (excludeDirectNeighbors) {
    for (const e of graph.edges) {
      if (e.from === nodeId) directNeighbors.add(e.to);
      if (e.to === nodeId) directNeighbors.add(e.from);
    }
  }

  // Map PPRResult[] to { node: KGNode; score: number }[]
  // Nodes whose IDs returned by PPR but not in graph.nodes are silently filtered
  const results: Array<{ node: KGNode; score: number }> = [];
  for (const pprResult of pprResults) {
    if (pprResult.nodeId === nodeId) continue; // exclude seed itself
    if (excludeDirectNeighbors && directNeighbors.has(pprResult.nodeId)) continue;
    const node = graph.nodes.find((n) => n.id === pprResult.nodeId);
    if (!node) continue; // silently filter ghost nodes
    results.push({ node, score: pprResult.score });
  }

  // Results are already sorted by PPR score descending (personalizedPageRank returns sorted)
  return results.slice(0, limit);
}

/**
 * Merge two nodes in a graph according to a MergeProposal.
 * Returns a new immutable graph with the merge applied.
 * Attempts to transfer cross-refs in DB if available (never fails merge on DB error).
 */
export async function mergeNodes(
  graph: KnowledgeGraph,
  proposal: MergeProposal,
): Promise<KnowledgeGraph> {
  const validated = MergeProposalSchema.parse(proposal);

  const keepNode = graph.nodes.find((n) => n.id === validated.keepNodeId);
  if (!keepNode) throw new Error(`Node not found: ${validated.keepNodeId}`);

  const removeNode = graph.nodes.find((n) => n.id === validated.removeNodeId);
  if (!removeNode) throw new Error(`Node not found: ${validated.removeNodeId}`);

  // Build merged node
  const mergedProperties: Record<string, unknown> = {
    ...removeNode.properties,
    ...keepNode.properties,
    merged_from: validated.removeNodeId,
    merge_reason: validated.reason,
  };

  const mergedNode: KGNode = {
    ...keepNode,
    title: validated.mergedTitle,
    properties: mergedProperties,
    confidence: Math.max(keepNode.confidence, removeNode.confidence),
    updated: new Date().toISOString(),
  };

  // Build new nodes list (replace keepNode, remove removeNode)
  const newNodes = graph.nodes
    .filter((n) => n.id !== validated.removeNodeId)
    .map((n) => (n.id === validated.keepNodeId ? mergedNode : n));

  // Redirect edges, deduplicating by from+to+type
  const seenKeys = new Set<string>();
  const newEdges = graph.edges
    .map((e) => {
      const from = e.from === validated.removeNodeId ? validated.keepNodeId : e.from;
      const to = e.to === validated.removeNodeId ? validated.keepNodeId : e.to;
      return { ...e, from, to };
    })
    .filter((e) => {
      // Skip self-loops
      if (e.from === e.to) return false;
      // Skip duplicates
      const key = `${e.from}|${e.to}|${e.type}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

  // Transfer cross-refs from removed node to kept node (if DB available)
  try {
    const { transferCrossRefs } = await import('../aurora/cross-ref.js');
    const { isDbAvailable } = await import('./db.js');
    if (await isDbAvailable()) {
      await transferCrossRefs(validated.removeNodeId, validated.keepNodeId, 'neuron');
    }
  } catch (err) {
    logger.error('graph merge failed', { error: String(err) });
  }

  return {
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Find stale nodes with low confidence that haven't been updated recently.
 */
export function findStaleNodes(
  graph: KnowledgeGraph,
  options?: { maxConfidence?: number; staleDays?: number },
): KGNode[] {
  const maxConfidence = options?.maxConfidence ?? 0.15;
  const staleDays = options?.staleDays ?? 30;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const cutoffISO = cutoff.toISOString();

  return graph.nodes.filter(
    (node) => node.confidence <= maxConfidence && node.updated < cutoffISO,
  );
}

/**
 * Find pairs of nodes that share 2+ common neighbors but have
 * no direct edge between them. Suggests potential missing edges.
 * Returns sorted by sharedNeighbors descending.
 */
export function findMissingEdges(
  graph: KnowledgeGraph,
): Array<{ from: string; to: string; sharedNeighbors: number }> {
  // Build adjacency map (bidirectional, ignoring edge type)
  const neighbors = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    neighbors.set(node.id, new Set());
  }
  for (const edge of graph.edges) {
    neighbors.get(edge.from)?.add(edge.to);
    neighbors.get(edge.to)?.add(edge.from);
  }

  // Build set of directly connected pairs (bidirectional)
  const directEdges = new Set<string>();
  for (const edge of graph.edges) {
    directEdges.add(`${edge.from}|${edge.to}`);
    directEdges.add(`${edge.to}|${edge.from}`);
  }

  const results: Array<{ from: string; to: string; sharedNeighbors: number }> = [];
  const nodeIds = graph.nodes.map((n) => n.id);

  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const a = nodeIds[i];
      const b = nodeIds[j];

      // Skip if already directly connected
      if (directEdges.has(`${a}|${b}`)) continue;

      const neighborsA = neighbors.get(a);
      const neighborsB = neighbors.get(b);
      if (!neighborsA || !neighborsB) continue;

      let shared = 0;
      for (const n of neighborsA) {
        if (neighborsB.has(n)) shared++;
      }

      if (shared >= 2) {
        results.push({ from: a, to: b, sharedNeighbors: shared });
      }
    }
  }

  return results.sort((x, y) => y.sharedNeighbors - x.sharedNeighbors);
}

// --- Abstraction ---

/**
 * Proposal for creating an abstraction node over a set of source nodes.
 * `reason` is NOT stored in the graph — it is only used by callers for reporting.
 */
export interface AbstractionProposal {
  sourceNodeIds: string[];
  title: string;
  description: string;
  reason: string;
}

/**
 * Create an abstraction node that generalizes a set of source nodes.
 * Mutates the given graph by adding the abstraction node and 'generalizes' edges.
 *
 * Validation is fail-fast: all checks run before any graph mutation.
 */
export function abstractNodes(
  graph: KnowledgeGraph,
  proposal: AbstractionProposal,
): { abstractionNode: KGNode; edgesCreated: number } {
  const { sourceNodeIds, title, description } = proposal;

  // 1. Reject empty or too-small list
  if (!sourceNodeIds || sourceNodeIds.length < 2) {
    throw new Error(
      `abstractNodes: needs at least 2 source nodes, got ${sourceNodeIds?.length ?? 0}`,
    );
  }

  // 2. Reject duplicate IDs
  const uniqueIds = new Set(sourceNodeIds);
  if (uniqueIds.size !== sourceNodeIds.length) {
    throw new Error('abstractNodes: sourceNodeIds contains duplicates');
  }

  // 3. Verify all source IDs exist in graph
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const id of sourceNodeIds) {
    if (!nodeMap.has(id)) {
      throw new Error(`abstractNodes: node '${id}' not found in graph`);
    }
  }

  // 4. Reject if any source node is itself an abstraction (no meta-meta-nodes)
  for (const id of sourceNodeIds) {
    const node = nodeMap.get(id)!;
    if (node.properties?.abstraction === true) {
      throw new Error(
        `abstractNodes: node '${id}' is already an abstraction (no meta-meta-nodes)`,
      );
    }
  }

  // All checks pass — now mutate

  // 5. Compute confidence: mean(sources) - 0.1, min 0.1
  const sourceNodes = sourceNodeIds.map((id) => nodeMap.get(id)!);
  const meanConf =
    sourceNodes.reduce((sum, n) => sum + n.confidence, 0) / sourceNodes.length;
  const confidence = Math.max(0.1, meanConf - 0.1);

  // 6. Create abstraction node
  const now = new Date().toISOString();
  const abstractionNode: KGNode = {
    id: `abstraction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'pattern',
    title,
    confidence,
    scope: 'universal',
    properties: {
      abstraction: true,
      source_nodes: sourceNodeIds,
      description,
    },
    created: now,
    updated: now,
  };

  graph.nodes.push(abstractionNode);

  // 7. Create 'generalizes' edges: abstraction → each source node
  for (const srcId of sourceNodeIds) {
    const edge: KGEdge = {
      from: abstractionNode.id,
      to: srcId,
      type: 'generalizes',
      metadata: {},
    };
    graph.edges.push(edge);
  }

  return { abstractionNode, edgesCreated: sourceNodeIds.length };
}

/**
 * Find clusters of same-type nodes that share ≥2 common neighbors.
 * These clusters are candidates for abstraction via abstractNodes().
 *
 * Algorithm:
 *   1. Build neighbor sets for all non-abstraction nodes.
 *   2. Group non-abstraction nodes by type.
 *   3. For each type group, build a pair-adjacency graph where two nodes
 *      are adjacent iff they share ≥2 common neighbors.
 *   4. Find connected components (BFS) of size >= minClusterSize.
 *   5. Report each component with its minimum pairwise common-neighbor count
 *      (over directly-adjacent pairs only).
 *
 * Returns results sorted by commonNeighborCount descending.
 */
export function findAbstractionCandidates(
  graph: KnowledgeGraph,
  minClusterSize = 3,
): Array<{ nodeIds: string[]; commonNeighborCount: number; type: NodeType }> {
  // Exclude abstraction nodes from candidates
  const nonAbstractionNodes = graph.nodes.filter(
    (n) => !n.properties?.abstraction,
  );

  // Build neighbor set for each non-abstraction node (neighbors = all connected nodes)
  const neighborMap = new Map<string, Set<string>>();
  for (const node of nonAbstractionNodes) {
    neighborMap.set(node.id, new Set());
  }
  for (const edge of graph.edges) {
    if (neighborMap.has(edge.from) && neighborMap.has(edge.to)) {
      neighborMap.get(edge.from)!.add(edge.to);
      neighborMap.get(edge.to)!.add(edge.from);
    }
  }

  // Group non-abstraction nodes by type
  const byType = new Map<NodeType, KGNode[]>();
  for (const node of nonAbstractionNodes) {
    if (!byType.has(node.type)) byType.set(node.type, []);
    byType.get(node.type)!.push(node);
  }

  const results: Array<{
    nodeIds: string[];
    commonNeighborCount: number;
    type: NodeType;
  }> = [];

  for (const [nodeType, typeNodes] of byType) {
    const ids = typeNodes.map((n) => n.id);
    if (ids.length < minClusterSize) continue;

    // Build pair-adjacency: pairAdj[i][j] = sharedNeighborCount (≥2 to be adjacent)
    const pairAdj = new Map<string, Set<string>>();
    for (const id of ids) pairAdj.set(id, new Set());

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const nbA = neighborMap.get(a)!;
        const nbB = neighborMap.get(b)!;
        let shared = 0;
        for (const n of nbA) {
          if (nbB.has(n)) shared++;
        }
        if (shared >= 2) {
          pairAdj.get(a)!.add(b);
          pairAdj.get(b)!.add(a);
        }
      }
    }

    // BFS to find connected components
    const visited = new Set<string>();
    for (const startId of ids) {
      if (visited.has(startId)) continue;
      // BFS
      const component: string[] = [];
      const queue: string[] = [startId];
      visited.add(startId);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        component.push(curr);
        for (const neighbor of pairAdj.get(curr)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      if (component.length < minClusterSize) continue;

      // Compute minimum pairwise shared-neighbor count for adjacent pairs
      let minShared = Infinity;
      for (let i = 0; i < component.length; i++) {
        for (let j = i + 1; j < component.length; j++) {
          const a = component[i];
          const b = component[j];
          if (!pairAdj.get(a)!.has(b)) continue; // only adjacent pairs
          const nbA = neighborMap.get(a)!;
          const nbB = neighborMap.get(b)!;
          let shared = 0;
          for (const n of nbA) {
            if (nbB.has(n)) shared++;
          }
          minShared = Math.min(minShared, shared);
        }
      }

      results.push({
        nodeIds: component,
        commonNeighborCount: minShared === Infinity ? 0 : minShared,
        type: nodeType,
      });
    }
  }

  return results.sort((a, b) => b.commonNeighborCount - a.commonNeighborCount);
}
