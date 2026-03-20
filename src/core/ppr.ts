/**
 * Personalized PageRank (PPR) implementation.
 *
 * Uses iterative power iteration with dangling node handling,
 * optimized for HippoRAG 2 knowledge graph retrieval.
 */

export interface PPROptions {
  /** Damping factor. Default 0.5 (HippoRAG 2 optimal). */
  damping?: number;
  /** Maximum iterations. Default 50. */
  maxIterations?: number;
  /** Convergence tolerance (L1 norm). Default 1e-6. */
  tolerance?: number;
}

export interface PPRResult {
  nodeId: string;
  score: number;
}

/**
 * Compute Personalized PageRank on a directed graph.
 *
 * @param nodes - All node IDs in the graph
 * @param edges - Directed edges (from → to). Caller is responsible for bidirectional duplication.
 * @param seeds - Personalization vector (nodeId → weight). Normalized internally.
 * @param options - Algorithm parameters
 * @returns All nodes with score > 0, sorted descending by score
 *
 * @throws Error("Seed weights sum to zero") if all seed weights are 0
 *
 * Not thread-safe. Same input always produces same output (idempotent/deterministic).
 */
export function personalizedPageRank(
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
  seeds: Map<string, number>,
  options?: PPROptions,
): PPRResult[] {
  const alpha = options?.damping ?? 0.5;
  const maxIterations = options?.maxIterations ?? 50;
  const tolerance = options?.tolerance ?? 1e-6;

  const nodeSet = new Set(nodes);

  // Step 1-2: Filter self-loops and edges with unknown nodes
  const validEdges = edges.filter(
    (e) => e.from !== e.to && nodeSet.has(e.from) && nodeSet.has(e.to),
  );

  // Step 3: Build adjacency list (outgoing neighbors per node)
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    outgoing.set(node, []);
  }
  for (const edge of validEdges) {
    outgoing.get(edge.from)!.push(edge.to);
  }

  // Step 4: Identify dangling nodes (0 outgoing edges)
  const danglingNodes: string[] = [];
  for (const node of nodes) {
    if (outgoing.get(node)!.length === 0) {
      danglingNodes.push(node);
    }
  }

  // Step 5: Build personalization vector p, normalized to sum 1.0
  const p = new Map<string, number>();
  let seedSum = 0;
  for (const [nodeId, weight] of seeds) {
    if (nodeSet.has(nodeId)) {
      seedSum += weight;
    }
  }
  if (seedSum === 0) {
    throw new Error('Seed weights sum to zero');
  }
  for (const node of nodes) {
    const raw = seeds.get(node) ?? 0;
    p.set(node, raw / seedSum);
  }

  // Step 6: Initialize π = copy of p
  let pi = new Map<string, number>(p);

  // Step 7: Power iteration
  for (let iter = 0; iter < maxIterations; iter++) {
    // 7a: Dangling mass
    let danglingMass = 0;
    for (const node of danglingNodes) {
      danglingMass += pi.get(node)!;
    }

    // 7b: Compute new scores
    const piNew = new Map<string, number>();
    for (const node of nodes) {
      piNew.set(node, 0);
    }

    // Distribute scores from non-dangling nodes via edges
    for (const node of nodes) {
      const neighbors = outgoing.get(node)!;
      if (neighbors.length === 0) continue;
      const share = pi.get(node)! / neighbors.length;
      for (const neighbor of neighbors) {
        piNew.set(neighbor, piNew.get(neighbor)! + share);
      }
    }

    // Apply damping formula: π_new[i] = (1-α)*p[i] + α*(edgeContrib + d*p[i])
    for (const node of nodes) {
      const pNode = p.get(node)!;
      const edgeContrib = piNew.get(node)!;
      piNew.set(
        node,
        (1 - alpha) * pNode + alpha * (edgeContrib + danglingMass * pNode),
      );
    }

    // 7c: Check convergence (L1 norm)
    let diff = 0;
    for (const node of nodes) {
      diff += Math.abs(piNew.get(node)! - pi.get(node)!);
    }
    pi = piNew;
    if (diff < tolerance) break;
  }

  // Step 8: Return nodes with score > 0, sorted descending
  const results: PPRResult[] = [];
  for (const node of nodes) {
    const score = pi.get(node)!;
    if (score > 0) {
      results.push({ nodeId: node, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}
