import { z } from 'zod';
import type { KnowledgeGraph, KGNode } from './knowledge-graph.js';

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
 */
export function findDuplicateCandidates(
  graph: KnowledgeGraph,
  similarityThreshold: number = 0.6,
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

  return results.sort((x, y) => y.similarity - x.similarity);
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
  } catch {
    // DB might not be available — merge still succeeds
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
