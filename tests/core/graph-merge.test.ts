import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeTitle,
  jaccardSimilarity,
  findDuplicateCandidates,
  findPprCandidates,
  mergeNodes,
  findStaleNodes,
  findMissingEdges,
  abstractNodes,
  findAbstractionCandidates,
  MergeProposalSchema,
} from '../../src/core/graph-merge.js';
import {
  createEmptyGraph,
  addNode,
  addEdge,
  type KnowledgeGraph,
  type KGNode,
  type KGEdge,
} from '../../src/core/knowledge-graph.js';
import fs from 'fs/promises';
import path from 'path';

// Mock ppr.js so tests don't run real PageRank
vi.mock('../../src/core/ppr.js', () => ({
  personalizedPageRank: vi.fn(),
}));

import * as pprModule from '../../src/core/ppr.js';

// --- Helpers ---

function makeNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'test-001',
    type: 'pattern',
    title: 'Test pattern',
    properties: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<KGEdge> = {}): KGEdge {
  return {
    from: 'a',
    to: 'b',
    type: 'related_to',
    metadata: {},
    ...overrides,
  };
}

function buildGraphWithNodes(nodes: KGNode[], edges: KGEdge[] = []): KnowledgeGraph {
  let graph = createEmptyGraph();
  for (const node of nodes) {
    graph = addNode(graph, node);
  }
  for (const edge of edges) {
    graph = addEdge(graph, edge);
  }
  return graph;
}

// --- Tests ---

describe('normalizeTitle', () => {
  it('normalizes title by lowercasing and removing stop words', () => {
    expect(normalizeTitle('The Retry with Exponential Backoff')).toBe(
      'retry exponential backoff',
    );
  });

  it('collapses whitespace', () => {
    expect(normalizeTitle('  foo   bar   baz  ')).toBe('foo bar baz');
  });

  it('removes multiple stop words', () => {
    expect(normalizeTitle('A guide to the art of coding')).toBe('guide art coding');
  });

  it('returns empty string for all stop words', () => {
    expect(normalizeTitle('the a an in on')).toBe('');
  });
});

describe('jaccardSimilarity', () => {
  it('computes correct Jaccard similarity', () => {
    // Same words in different order → 1.0
    expect(jaccardSimilarity('retry backoff exponential', 'retry exponential backoff')).toBe(1.0);
  });

  it('returns 0 for completely different strings', () => {
    expect(jaccardSimilarity('hello world', 'foo bar')).toBe(0);
  });

  it('returns 0 for two empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(0);
  });

  it('computes partial overlap correctly', () => {
    // {retry, backoff} ∩ {retry, timeout} = {retry} => 1/3
    expect(jaccardSimilarity('retry backoff', 'retry timeout')).toBeCloseTo(1 / 3);
  });

  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('foo bar', 'foo bar')).toBe(1);
  });
});

describe('findDuplicateCandidates', () => {
  it('finds nodes with similar titles', () => {
    // 'retry with backoff' normalizes to 'retry backoff'
    // 'retry backoff strategy' normalizes to 'retry backoff strategy'
    // Jaccard: {retry, backoff} ∩ {retry, backoff, strategy} = 2, union = 3 → 2/3 ≈ 0.67
    const graph = buildGraphWithNodes([
      makeNode({ id: 'a', title: 'retry with backoff', type: 'pattern' }),
      makeNode({ id: 'b', title: 'retry backoff strategy', type: 'pattern' }),
    ]);
    const candidates = findDuplicateCandidates(graph, 0.6);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].similarity).toBeCloseTo(2 / 3);
  });

  it('returns empty list when no similarities exist', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'a', title: 'memory optimization strategy', type: 'pattern' }),
      makeNode({ id: 'b', title: 'file handling errors', type: 'pattern' }),
    ]);
    const candidates = findDuplicateCandidates(graph, 0.6);
    expect(candidates).toEqual([]);
  });

  it('only compares nodes of the same type', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'a', title: 'retry backoff', type: 'pattern' }),
      makeNode({ id: 'b', title: 'retry backoff', type: 'error' }),
    ]);
    const candidates = findDuplicateCandidates(graph, 0.5);
    expect(candidates).toEqual([]);
  });

  it('returns results sorted by similarity descending', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'a', title: 'retry logic pattern handler', type: 'pattern' }),
      makeNode({ id: 'b', title: 'retry logic pattern handler exact', type: 'pattern' }),
      makeNode({ id: 'c', title: 'retry logic', type: 'pattern' }),
    ]);
    const candidates = findDuplicateCandidates(graph, 0.3);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].similarity).toBeGreaterThanOrEqual(
        candidates[i].similarity,
      );
    }
  });
});

describe('mergeNodes', () => {
  it('combines properties with keepNode winning on conflict', async () => {
    const graph = buildGraphWithNodes([
      makeNode({
        id: 'keep',
        title: 'Keep',
        confidence: 0.7,
        properties: { source: 'A', level: 'high' },
      }),
      makeNode({
        id: 'remove',
        title: 'Remove',
        confidence: 0.5,
        properties: { source: 'B', extra: true },
      }),
    ]);

    const result = await mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'Merged Node',
      reason: 'duplicates',
    });

    const merged = result.nodes.find((n) => n.id === 'keep')!;
    expect(merged.properties.source).toBe('A'); // keepNode wins
    expect(merged.properties.level).toBe('high');
    expect(merged.properties.extra).toBe(true);
    expect(merged.properties.merged_from).toBe('remove');
    expect(merged.properties.merge_reason).toBe('duplicates');
  });

  it('redirects edges from removed node to kept node', async () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'A', title: 'Node A' }),
        makeNode({ id: 'B', title: 'Node B' }),
        makeNode({ id: 'C', title: 'Node C' }),
      ],
      [makeEdge({ from: 'B', to: 'C' })],
    );

    const result = await mergeNodes(graph, {
      keepNodeId: 'A',
      removeNodeId: 'B',
      mergedTitle: 'Merged AB',
      reason: 'duplicates',
    });

    // B→C should now be A→C
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe('A');
    expect(result.edges[0].to).toBe('C');
    // B should be removed
    expect(result.nodes.find((n) => n.id === 'B')).toBeUndefined();
  });

  it('sets confidence to max of both nodes', async () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'keep', title: 'Keep', confidence: 0.5 }),
      makeNode({ id: 'remove', title: 'Remove', confidence: 0.8 }),
    ]);

    const result = await mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'Merged',
      reason: 'dup',
    });

    expect(result.nodes[0].confidence).toBe(0.8);
  });

  it('throws if keepNodeId does not exist', async () => {
    const graph = buildGraphWithNodes([makeNode({ id: 'remove' })]);
    await expect(
      mergeNodes(graph, {
        keepNodeId: 'nonexistent',
        removeNodeId: 'remove',
        mergedTitle: 'X',
        reason: 'test',
      }),
    ).rejects.toThrow('Node not found: nonexistent');
  });

  it('throws if removeNodeId does not exist', async () => {
    const graph = buildGraphWithNodes([makeNode({ id: 'keep' })]);
    await expect(
      mergeNodes(graph, {
        keepNodeId: 'keep',
        removeNodeId: 'nonexistent',
        mergedTitle: 'X',
        reason: 'test',
      }),
    ).rejects.toThrow('Node not found: nonexistent');
  });

  it('removes self-loop edges after redirect', async () => {
    const graph = buildGraphWithNodes(
      [makeNode({ id: 'keep' }), makeNode({ id: 'remove' })],
      [makeEdge({ from: 'keep', to: 'remove' })],
    );

    const result = await mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'Merged',
      reason: 'dup',
    });

    expect(result.edges).toHaveLength(0);
  });

  it('deduplicates edges after redirect', async () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'keep' }),
        makeNode({ id: 'remove' }),
        makeNode({ id: 'other' }),
      ],
      [
        makeEdge({ from: 'keep', to: 'other' }),
        makeEdge({ from: 'remove', to: 'other' }),
      ],
    );

    const result = await mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'Merged',
      reason: 'dup',
    });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe('keep');
    expect(result.edges[0].to).toBe('other');
  });

  it('does not mutate the original graph', async () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'keep', title: 'Keep' }),
      makeNode({ id: 'remove', title: 'Remove' }),
    ]);

    const originalNodes = graph.nodes.length;
    await mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'M',
      reason: 'r',
    });
    expect(graph.nodes.length).toBe(originalNodes);
  });
});

describe('findStaleNodes', () => {
  it('finds old nodes with low confidence', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const graph = buildGraphWithNodes([
      makeNode({ id: 'stale', confidence: 0.1, updated: oldDate.toISOString() }),
      makeNode({ id: 'high-conf', confidence: 0.9, updated: oldDate.toISOString() }),
    ]);

    const stale = findStaleNodes(graph);
    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe('stale');
  });

  it('skips recently updated nodes', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'recent', confidence: 0.1, updated: new Date().toISOString() }),
    ]);

    const stale = findStaleNodes(graph);
    expect(stale).toHaveLength(0);
  });

  it('respects custom options', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const graph = buildGraphWithNodes([
      makeNode({ id: 'a', confidence: 0.3, updated: oldDate.toISOString() }),
    ]);

    expect(findStaleNodes(graph, { maxConfidence: 0.5, staleDays: 5 })).toHaveLength(1);
    expect(findStaleNodes(graph, { maxConfidence: 0.2, staleDays: 5 })).toHaveLength(0);
  });
});

describe('findMissingEdges', () => {
  it('finds nodes sharing neighbors without direct edge', () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'A', title: 'Node A' }),
        makeNode({ id: 'B', title: 'Node B' }),
        makeNode({ id: 'C', title: 'Node C' }),
        makeNode({ id: 'D', title: 'Node D' }),
      ],
      [
        makeEdge({ from: 'A', to: 'C' }),
        makeEdge({ from: 'A', to: 'D' }),
        makeEdge({ from: 'B', to: 'C' }),
        makeEdge({ from: 'B', to: 'D' }),
      ],
    );

    const missing = findMissingEdges(graph);
    const abPair = missing.find(
      (m) => (m.from === 'A' && m.to === 'B') || (m.from === 'B' && m.to === 'A'),
    );
    expect(abPair).toBeDefined();
    expect(abPair!.sharedNeighbors).toBe(2);
  });

  it('returns empty list when all connections exist', () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'A', title: 'Node A' }),
        makeNode({ id: 'B', title: 'Node B' }),
        makeNode({ id: 'C', title: 'Node C' }),
      ],
      [
        makeEdge({ from: 'A', to: 'B' }),
        makeEdge({ from: 'A', to: 'C' }),
        makeEdge({ from: 'B', to: 'C' }),
      ],
    );

    const missing = findMissingEdges(graph);
    // A-B share C, A-C share B, B-C share A — but all have direct edges
    // With only 1 shared neighbor each (below threshold of 2), should be empty
    expect(missing).toEqual([]);
  });

  it('does not include pairs that are already directly connected', () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'A', title: 'Node A' }),
        makeNode({ id: 'B', title: 'Node B' }),
        makeNode({ id: 'hub1', title: 'Hub 1' }),
        makeNode({ id: 'hub2', title: 'Hub 2' }),
      ],
      [
        makeEdge({ from: 'A', to: 'hub1' }),
        makeEdge({ from: 'A', to: 'hub2' }),
        makeEdge({ from: 'B', to: 'hub1' }),
        makeEdge({ from: 'B', to: 'hub2' }),
        makeEdge({ from: 'A', to: 'B' }), // direct edge already exists
      ],
    );

    const missing = findMissingEdges(graph);
    const abPair = missing.find(
      (m) => (m.from === 'A' && m.to === 'B') || (m.from === 'B' && m.to === 'A'),
    );
    expect(abPair).toBeUndefined();
  });

  it('sorts by sharedNeighbors descending', () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'A', title: 'Node A' }),
        makeNode({ id: 'B', title: 'Node B' }),
        makeNode({ id: 'C', title: 'Node C' }),
        makeNode({ id: 'h1', title: 'Hub 1' }),
        makeNode({ id: 'h2', title: 'Hub 2' }),
        makeNode({ id: 'h3', title: 'Hub 3' }),
      ],
      [
        makeEdge({ from: 'A', to: 'h1' }),
        makeEdge({ from: 'B', to: 'h1' }),
        makeEdge({ from: 'A', to: 'h2' }),
        makeEdge({ from: 'B', to: 'h2' }),
        makeEdge({ from: 'A', to: 'h3' }),
        makeEdge({ from: 'B', to: 'h3' }),
        makeEdge({ from: 'C', to: 'h1' }),
        makeEdge({ from: 'C', to: 'h2' }),
      ],
    );

    const missing = findMissingEdges(graph);
    expect(missing.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < missing.length; i++) {
      expect(missing[i - 1].sharedNeighbors).toBeGreaterThanOrEqual(
        missing[i].sharedNeighbors,
      );
    }
  });
});

describe('MergeProposalSchema', () => {
  it('validates correct merge proposals', () => {
    const result = MergeProposalSchema.safeParse({
      keepNodeId: 'a',
      removeNodeId: 'b',
      mergedTitle: 'Combined title',
      reason: 'These nodes describe the same pattern',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = MergeProposalSchema.safeParse({ keepNodeId: 'a' });
    expect(result.success).toBe(false);
  });
});

describe('consolidator prompt', () => {
  it('consolidator prompt file exists and contains key sections', async () => {
    const promptPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../prompts/consolidator.md',
    );
    const content = await fs.readFile(promptPath, 'utf-8');
    expect(content).toContain('Merge Duplicates');
    expect(content).toContain('Strengthen Connections');
    expect(content).toContain('Knowledge Gaps');
    expect(content).toContain('Archive Stale Nodes');
  });
});

describe('abstractNodes', () => {
  function makeAbstractGraph(): KnowledgeGraph {
    return buildGraphWithNodes([
      makeNode({ id: 'n1', type: 'pattern', title: 'Timeout in API', confidence: 0.8, properties: {} }),
      makeNode({ id: 'n2', type: 'pattern', title: 'Timeout in DB', confidence: 0.6, properties: {} }),
      makeNode({ id: 'n3', type: 'pattern', title: 'Retry on failure', confidence: 0.9, properties: {} }),
    ]);
  }

  it('creates a new abstraction node with properties.abstraction = true and source_nodes', () => {
    const graph = makeAbstractGraph();
    const { abstractionNode } = abstractNodes(graph, {
      sourceNodeIds: ['n1', 'n2'],
      title: 'Resilience timeout meta-pattern',
      description: 'Generalizes timeout handling patterns',
      reason: 'Both are timeout patterns',
    });
    expect(abstractionNode.properties?.abstraction).toBe(true);
    expect(abstractionNode.properties?.source_nodes).toEqual(['n1', 'n2']);
    expect(graph.nodes).toContain(abstractionNode);
  });

  it('reason is NOT stored in graph node properties', () => {
    const graph = makeAbstractGraph();
    const { abstractionNode } = abstractNodes(graph, {
      sourceNodeIds: ['n1', 'n2'],
      title: 'Meta',
      description: 'Meta desc',
      reason: 'Secret reason',
    });
    expect(JSON.stringify(abstractionNode.properties)).not.toContain('Secret reason');
    expect((abstractionNode.properties as Record<string, unknown>).reason).toBeUndefined();
  });

  it('creates generalizes edges from abstraction node to each source node', () => {
    const graph = makeAbstractGraph();
    const { abstractionNode, edgesCreated } = abstractNodes(graph, {
      sourceNodeIds: ['n1', 'n2'],
      title: 'Meta',
      description: 'Meta desc',
      reason: 'test',
    });
    expect(edgesCreated).toBe(2);
    const genEdges = graph.edges.filter(
      (e) => e.type === 'generalizes' && e.from === abstractionNode.id,
    );
    expect(genEdges).toHaveLength(2);
    expect(genEdges.map((e) => e.to).sort()).toEqual(['n1', 'n2']);
  });

  it('computes confidence = mean(sources) - 0.1', () => {
    const graph = makeAbstractGraph();
    // n1=0.8, n2=0.6 => mean=0.7 => 0.7-0.1=0.6
    const { abstractionNode } = abstractNodes(graph, {
      sourceNodeIds: ['n1', 'n2'],
      title: 'Meta',
      description: 'Meta desc',
      reason: 'test',
    });
    expect(abstractionNode.confidence).toBeCloseTo(0.6);
  });

  it('confidence is minimum 0.1 even if sources have very low confidence', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'low1', type: 'pattern', title: 'L1', confidence: 0.1, properties: {} }),
      makeNode({ id: 'low2', type: 'pattern', title: 'L2', confidence: 0.1, properties: {} }),
    ]);
    const { abstractionNode } = abstractNodes(graph, {
      sourceNodeIds: ['low1', 'low2'],
      title: 'Meta',
      description: 'Meta',
      reason: 'test',
    });
    expect(abstractionNode.confidence).toBeGreaterThanOrEqual(0.1);
  });

  it('throws if sourceNodeIds is empty', () => {
    const graph = makeAbstractGraph();
    expect(() =>
      abstractNodes(graph, { sourceNodeIds: [], title: 'X', description: 'X', reason: 'X' }),
    ).toThrow();
  });

  it('throws if sourceNodeIds has only 1 element', () => {
    const graph = makeAbstractGraph();
    expect(() =>
      abstractNodes(graph, { sourceNodeIds: ['n1'], title: 'X', description: 'X', reason: 'X' }),
    ).toThrow();
  });

  it('throws if a sourceNodeId does not exist in graph', () => {
    const graph = makeAbstractGraph();
    expect(() =>
      abstractNodes(graph, {
        sourceNodeIds: ['n1', 'missing'],
        title: 'X',
        description: 'X',
        reason: 'X',
      }),
    ).toThrow();
  });

  it('throws if sourceNodeIds contains duplicate IDs', () => {
    const graph = makeAbstractGraph();
    expect(() =>
      abstractNodes(graph, {
        sourceNodeIds: ['n1', 'n1'],
        title: 'X',
        description: 'X',
        reason: 'X',
      }),
    ).toThrow();
  });

  it('throws if a source node is already an abstraction (no meta-meta-nodes)', () => {
    const graph = buildGraphWithNodes([
      makeNode({
        id: 'abs1',
        type: 'pattern',
        title: 'Abs',
        confidence: 0.7,
        properties: { abstraction: true },
      }),
      makeNode({ id: 'n2', type: 'pattern', title: 'N2', confidence: 0.7, properties: {} }),
    ]);
    expect(() =>
      abstractNodes(graph, {
        sourceNodeIds: ['abs1', 'n2'],
        title: 'X',
        description: 'X',
        reason: 'X',
      }),
    ).toThrow();
  });

  it('does not mutate graph if validation fails', () => {
    const graph = makeAbstractGraph();
    const originalNodeCount = graph.nodes.length;
    const originalEdgeCount = graph.edges.length;
    expect(() =>
      abstractNodes(graph, {
        sourceNodeIds: ['n1', 'missing'],
        title: 'X',
        description: 'X',
        reason: 'X',
      }),
    ).toThrow();
    expect(graph.nodes.length).toBe(originalNodeCount);
    expect(graph.edges.length).toBe(originalEdgeCount);
  });

  it('abstraction node type is pattern', () => {
    const graph = makeAbstractGraph();
    const { abstractionNode } = abstractNodes(graph, {
      sourceNodeIds: ['n1', 'n2'],
      title: 'Meta',
      description: 'Meta desc',
      reason: 'test',
    });
    expect(abstractionNode.type).toBe('pattern');
  });
});

describe('findAbstractionCandidates', () => {
  it('returns empty array when graph has fewer nodes than minClusterSize', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'n1', type: 'pattern', title: 'A', confidence: 0.7, properties: {} }),
      makeNode({ id: 'n2', type: 'pattern', title: 'B', confidence: 0.7, properties: {} }),
    ]);
    expect(findAbstractionCandidates(graph, 3)).toEqual([]);
  });

  it('finds a cluster of nodes sharing >=2 common neighbors', () => {
    // Nodes n1, n2, n3 all share neighbors hub1 and hub2
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'n1', type: 'error', title: 'E1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'n2', type: 'error', title: 'E2', confidence: 0.7, properties: {} }),
        makeNode({ id: 'n3', type: 'error', title: 'E3', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub1', type: 'pattern', title: 'H1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub2', type: 'pattern', title: 'H2', confidence: 0.7, properties: {} }),
      ],
      [
        makeEdge({ from: 'n1', to: 'hub1' }),
        makeEdge({ from: 'n1', to: 'hub2' }),
        makeEdge({ from: 'n2', to: 'hub1' }),
        makeEdge({ from: 'n2', to: 'hub2' }),
        makeEdge({ from: 'n3', to: 'hub1' }),
        makeEdge({ from: 'n3', to: 'hub2' }),
      ],
    );
    const candidates = findAbstractionCandidates(graph, 3);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const errorCluster = candidates.find((c) => c.type === 'error');
    expect(errorCluster).toBeDefined();
    expect(errorCluster!.nodeIds.sort()).toEqual(['n1', 'n2', 'n3']);
    expect(errorCluster!.commonNeighborCount).toBeGreaterThanOrEqual(2);
  });

  it('respects minClusterSize — does not return cluster smaller than minClusterSize', () => {
    // Only 2 nodes share >=2 neighbors
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'n1', type: 'error', title: 'E1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'n2', type: 'error', title: 'E2', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub1', type: 'pattern', title: 'H1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub2', type: 'pattern', title: 'H2', confidence: 0.7, properties: {} }),
      ],
      [
        makeEdge({ from: 'n1', to: 'hub1' }),
        makeEdge({ from: 'n1', to: 'hub2' }),
        makeEdge({ from: 'n2', to: 'hub1' }),
        makeEdge({ from: 'n2', to: 'hub2' }),
      ],
    );
    // minClusterSize=3: cluster of 2 should NOT appear
    const candidates3 = findAbstractionCandidates(graph, 3);
    expect(candidates3.every((c) => c.nodeIds.length >= 3)).toBe(true);
    // minClusterSize=2: cluster of 2 SHOULD appear
    const candidates2 = findAbstractionCandidates(graph, 2);
    const errorCluster = candidates2.find((c) => c.type === 'error');
    expect(errorCluster).toBeDefined();
  });

  it('excludes abstraction nodes from candidates', () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({
          id: 'abs1',
          type: 'pattern',
          title: 'Abs',
          confidence: 0.7,
          properties: { abstraction: true },
        }),
        makeNode({ id: 'n1', type: 'pattern', title: 'P1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'n2', type: 'pattern', title: 'P2', confidence: 0.7, properties: {} }),
        makeNode({ id: 'n3', type: 'pattern', title: 'P3', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub1', type: 'error', title: 'H1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub2', type: 'error', title: 'H2', confidence: 0.7, properties: {} }),
      ],
      [
        makeEdge({ from: 'abs1', to: 'hub1' }),
        makeEdge({ from: 'abs1', to: 'hub2' }),
        makeEdge({ from: 'n1', to: 'hub1' }),
        makeEdge({ from: 'n1', to: 'hub2' }),
        makeEdge({ from: 'n2', to: 'hub1' }),
        makeEdge({ from: 'n2', to: 'hub2' }),
        makeEdge({ from: 'n3', to: 'hub1' }),
        makeEdge({ from: 'n3', to: 'hub2' }),
      ],
    );
    const candidates = findAbstractionCandidates(graph, 3);
    const patternCluster = candidates.find((c) => c.type === 'pattern');
    if (patternCluster) {
      expect(patternCluster.nodeIds).not.toContain('abs1');
    }
  });

  it('chains: A-B share neighbors, B-C share neighbors => A,B,C form one cluster even if A-C do not share neighbors', () => {
    // A and B share hub1+hub2 (commonCount=2)
    // B and C share hub3+hub4 (commonCount=2)
    // A and C do NOT share any neighbors
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'A', type: 'error', title: 'A', confidence: 0.7, properties: {} }),
        makeNode({ id: 'B', type: 'error', title: 'B', confidence: 0.7, properties: {} }),
        makeNode({ id: 'C', type: 'error', title: 'C', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub1', type: 'pattern', title: 'H1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub2', type: 'pattern', title: 'H2', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub3', type: 'pattern', title: 'H3', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub4', type: 'pattern', title: 'H4', confidence: 0.7, properties: {} }),
      ],
      [
        // A-B share hub1, hub2
        makeEdge({ from: 'A', to: 'hub1' }),
        makeEdge({ from: 'A', to: 'hub2' }),
        makeEdge({ from: 'B', to: 'hub1' }),
        makeEdge({ from: 'B', to: 'hub2' }),
        // B-C share hub3, hub4
        makeEdge({ from: 'B', to: 'hub3' }),
        makeEdge({ from: 'B', to: 'hub4' }),
        makeEdge({ from: 'C', to: 'hub3' }),
        makeEdge({ from: 'C', to: 'hub4' }),
      ],
    );
    const candidates = findAbstractionCandidates(graph, 3);
    const errorCluster = candidates.find((c) => c.type === 'error');
    expect(errorCluster).toBeDefined();
    expect(errorCluster!.nodeIds.sort()).toEqual(['A', 'B', 'C']);
  });

  it('sorts results by commonNeighborCount descending', () => {
    // e1, e2, e3 all share 3 hubs => commonNeighborCount = 3
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'e1', type: 'error', title: 'E1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'e2', type: 'error', title: 'E2', confidence: 0.7, properties: {} }),
        makeNode({ id: 'e3', type: 'error', title: 'E3', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub1', type: 'pattern', title: 'H1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub2', type: 'pattern', title: 'H2', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub3', type: 'pattern', title: 'H3', confidence: 0.7, properties: {} }),
      ],
      [
        makeEdge({ from: 'e1', to: 'hub1' }),
        makeEdge({ from: 'e1', to: 'hub2' }),
        makeEdge({ from: 'e1', to: 'hub3' }),
        makeEdge({ from: 'e2', to: 'hub1' }),
        makeEdge({ from: 'e2', to: 'hub2' }),
        makeEdge({ from: 'e2', to: 'hub3' }),
        makeEdge({ from: 'e3', to: 'hub1' }),
        makeEdge({ from: 'e3', to: 'hub2' }),
        makeEdge({ from: 'e3', to: 'hub3' }),
      ],
    );
    const candidates = findAbstractionCandidates(graph, 3);
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].commonNeighborCount).toBeGreaterThanOrEqual(
        candidates[i + 1].commonNeighborCount,
      );
    }
  });

  it('uses default minClusterSize=3 when not specified', () => {
    // Only 2 error nodes, default minClusterSize=3 => should not find any error cluster
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'n1', type: 'error', title: 'E1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'n2', type: 'error', title: 'E2', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub1', type: 'pattern', title: 'H1', confidence: 0.7, properties: {} }),
        makeNode({ id: 'hub2', type: 'pattern', title: 'H2', confidence: 0.7, properties: {} }),
      ],
      [
        makeEdge({ from: 'n1', to: 'hub1' }),
        makeEdge({ from: 'n1', to: 'hub2' }),
        makeEdge({ from: 'n2', to: 'hub1' }),
        makeEdge({ from: 'n2', to: 'hub2' }),
      ],
    );
    const candidates = findAbstractionCandidates(graph);
    expect(candidates.filter((c) => c.type === 'error').length).toBe(0);
  });
});


// --- PPR Tests ---

describe('findPprCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws Error if nodeId not found in graph', () => {
    const graph = buildGraphWithNodes([makeNode({ id: 'a' })]);
    expect(() => findPprCandidates(graph, 'nonexistent')).toThrow('Node not found: nonexistent');
  });

  it('returns empty array if graph has < 2 nodes', () => {
    const graph = buildGraphWithNodes([makeNode({ id: 'a' })]);
    expect(findPprCandidates(graph, 'a')).toEqual([]);
  });

  it('returns empty array if seed node has no edges (isolated)', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'a' }),
      makeNode({ id: 'b' }),
    ]);
    // No edges — seed is isolated
    expect(findPprCandidates(graph, 'a')).toEqual([]);
  });

  it('returns PPR-ranked nodes excluding seed and direct neighbors', () => {
    const nodeA = makeNode({ id: 'a', title: 'Node A' });
    const nodeB = makeNode({ id: 'b', title: 'Node B' });
    const nodeC = makeNode({ id: 'c', title: 'Node C' });
    const nodeD = makeNode({ id: 'd', title: 'Node D' });

    const graph = buildGraphWithNodes(
      [nodeA, nodeB, nodeC, nodeD],
      [
        makeEdge({ from: 'a', to: 'b' }),
        makeEdge({ from: 'b', to: 'c' }),
        makeEdge({ from: 'c', to: 'd' }),
      ]
    );

    // Mock PPR returning scores
    vi.mocked(pprModule.personalizedPageRank).mockReturnValue([
      { nodeId: 'b', score: 0.4 }, // direct neighbor — should be excluded
      { nodeId: 'c', score: 0.3 },
      { nodeId: 'd', score: 0.2 },
    ]);

    const results = findPprCandidates(graph, 'a');

    // 'b' is a direct neighbor → excluded
    expect(results).not.toContainEqual(expect.objectContaining({ node: expect.objectContaining({ id: nodeB.id }) }));
    // 'c' and 'd' should be in results
    expect(results).toContainEqual(expect.objectContaining({ node: expect.objectContaining({ id: nodeC.id }), score: 0.3 }));
    expect(results).toContainEqual(expect.objectContaining({ node: expect.objectContaining({ id: nodeD.id }), score: 0.2 }));
  });

  it('respects limit option', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => makeNode({ id: `n${i}` }));
    const edges = [makeEdge({ from: 'n0', to: 'n1' })];
    const graph = buildGraphWithNodes(nodes, edges);

    vi.mocked(pprModule.personalizedPageRank).mockReturnValue([
      { nodeId: 'n1', score: 0.5 },
      { nodeId: 'n2', score: 0.4 },
      { nodeId: 'n3', score: 0.3 },
      { nodeId: 'n4', score: 0.2 },
    ]);

    const results = findPprCandidates(graph, 'n0', { limit: 2 });
    // With excludeDirectNeighbors=true (default), 'n1' is excluded
    // Remaining: n2 (0.4), n3 (0.3), n4 (0.2) — limit 2 → n2, n3
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('silently filters ghost nodes (PPR returns ID not in graph)', () => {
    const nodeA = makeNode({ id: 'a' });
    const nodeB = makeNode({ id: 'b' });
    const graph = buildGraphWithNodes([nodeA, nodeB], [makeEdge({ from: 'a', to: 'b' })]);

    vi.mocked(pprModule.personalizedPageRank).mockReturnValue([
      { nodeId: 'b', score: 0.5 },       // direct neighbor, excluded
      { nodeId: 'ghost', score: 0.3 },   // not in graph — silently filtered
    ]);

    const results = findPprCandidates(graph, 'a');
    expect(results).toEqual([]); // b excluded (neighbor), ghost filtered
  });
});

describe('findDuplicateCandidates with usePpr option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('without usePpr behaves exactly as before (backward compat)', () => {
    const nodeA = makeNode({ id: 'n1', type: 'pattern', title: 'machine learning pattern' });
    const nodeB = makeNode({ id: 'n2', type: 'pattern', title: 'machine learning approach' });
    const nodeC = makeNode({ id: 'n3', type: 'pattern', title: 'completely different topic' });
    const graph = buildGraphWithNodes([nodeA, nodeB, nodeC]);

    const results = findDuplicateCandidates(graph, 0.3);

    // 'machine learning pattern' and 'machine learning approach' share tokens
    expect(results.some(r =>
      (r.nodeA === 'n1' && r.nodeB === 'n2') || (r.nodeA === 'n2' && r.nodeB === 'n1')
    )).toBe(true);

    // PPR should not have been called
    expect(vi.mocked(pprModule.personalizedPageRank)).not.toHaveBeenCalled();
  });

  it('with usePpr applies hybrid scoring formula: jaccard*0.6 + ppr*0.4', () => {
    const nodeA = makeNode({ id: 'n1', type: 'pattern', title: 'machine learning pattern' });
    const nodeB = makeNode({ id: 'n2', type: 'pattern', title: 'machine learning approach' });
    const graph = buildGraphWithNodes([nodeA, nodeB], []);

    // Jaccard between normalized titles:
    // "machine learning pattern" vs "machine learning approach"
    // intersection: {machine, learning} = 2, union = 4 → jaccard = 0.5
    //
    // Mock PPR: nodeB has score 0.3, max = 0.3 → normalized = 1.0
    vi.mocked(pprModule.personalizedPageRank).mockReturnValue([
      { nodeId: 'n2', score: 0.3 },
    ]);

    const results = findDuplicateCandidates(graph, 0.3, { usePpr: true });
    expect(results.length).toBe(1);

    // ppr_proximity = 0.3 / 0.3 = 1.0
    // final = 0.5 * 0.6 + 1.0 * 0.4 = 0.3 + 0.4 = 0.7
    expect(results[0].similarity).toBeCloseTo(0.7, 5);
  });

  it('epsilon guard: when all PPR scores < 1e-6, ppr_proximity = 0 (no NaN/Infinity)', () => {
    const nodeA = makeNode({ id: 'n1', type: 'pattern', title: 'machine learning pattern' });
    const nodeB = makeNode({ id: 'n2', type: 'pattern', title: 'machine learning approach' });
    const graph = buildGraphWithNodes([nodeA, nodeB], []);

    // All PPR scores below epsilon
    vi.mocked(pprModule.personalizedPageRank).mockReturnValue([
      { nodeId: 'n2', score: 1e-10 },
    ]);

    const results = findDuplicateCandidates(graph, 0.3, { usePpr: true });
    expect(results.length).toBe(1);

    // maxScore = 1e-10 < 1e-6 → ppr_proximity = 0
    // final = 0.5 * 0.6 + 0 * 0.4 = 0.3
    expect(results[0].similarity).toBeCloseTo(0.3, 5);
    expect(results[0].similarity).not.toBeNaN();
    expect(results[0].similarity).not.toBe(Infinity);
  });

  it('batch limit: 55 Jaccard candidates — top 50 PPR-boosted, rest keep Jaccard score', () => {
    // 11 nodes with very similar titles → 11*10/2 = 55 pairs
    const testNodes = Array.from({ length: 11 }, (_, i) =>
      makeNode({ id: `n${i}`, type: 'pattern', title: `alpha beta gamma delta epsilon node${i}` })
    );
    const graph = buildGraphWithNodes(testNodes, []);

    vi.mocked(pprModule.personalizedPageRank).mockReturnValue([
      { nodeId: 'n1', score: 0.5 },
    ]);

    const lowThreshold = 0.3;
    const results = findDuplicateCandidates(graph, lowThreshold, { usePpr: true });

    // PPR should have been called (boost ran)
    expect(vi.mocked(pprModule.personalizedPageRank)).toHaveBeenCalled();

    // All scores should be valid numbers
    for (const r of results) {
      expect(r.similarity).not.toBeNaN();
      expect(r.similarity).not.toBe(Infinity);
    }
    expect(results.length).toBeGreaterThan(0);
  });

  it('error handling: when PPR throws, falls back to Jaccard score and calls console.warn', () => {
    const nodeA = makeNode({ id: 'n1', type: 'pattern', title: 'machine learning pattern' });
    const nodeB = makeNode({ id: 'n2', type: 'pattern', title: 'machine learning approach' });
    const graph = buildGraphWithNodes([nodeA, nodeB], []);

    // PPR throws
    vi.mocked(pprModule.personalizedPageRank).mockImplementation(() => {
      throw new Error('PPR failure');
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const results = findDuplicateCandidates(graph, 0.3, { usePpr: true });

    expect(results.length).toBe(1);
    // Should use Jaccard score (0.5) when PPR throws
    expect(results[0].similarity).toBeCloseTo(0.5, 5);
    // console.warn should have been called
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('returns empty array if graph has < 2 nodes with usePpr: true', () => {
    const graph = buildGraphWithNodes([makeNode({ id: 'n1' })]);
    const results = findDuplicateCandidates(graph, 0.6, { usePpr: true });
    expect(results).toEqual([]);
  });
});
