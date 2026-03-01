import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  jaccardSimilarity,
  findDuplicateCandidates,
  mergeNodes,
  findStaleNodes,
  findMissingEdges,
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
  it('combines properties with keepNode winning on conflict', () => {
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

    const result = mergeNodes(graph, {
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

  it('redirects edges from removed node to kept node', () => {
    const graph = buildGraphWithNodes(
      [
        makeNode({ id: 'A', title: 'Node A' }),
        makeNode({ id: 'B', title: 'Node B' }),
        makeNode({ id: 'C', title: 'Node C' }),
      ],
      [makeEdge({ from: 'B', to: 'C' })],
    );

    const result = mergeNodes(graph, {
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

  it('sets confidence to max of both nodes', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'keep', title: 'Keep', confidence: 0.5 }),
      makeNode({ id: 'remove', title: 'Remove', confidence: 0.8 }),
    ]);

    const result = mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'Merged',
      reason: 'dup',
    });

    expect(result.nodes[0].confidence).toBe(0.8);
  });

  it('throws if keepNodeId does not exist', () => {
    const graph = buildGraphWithNodes([makeNode({ id: 'remove' })]);
    expect(() =>
      mergeNodes(graph, {
        keepNodeId: 'nonexistent',
        removeNodeId: 'remove',
        mergedTitle: 'X',
        reason: 'test',
      }),
    ).toThrow('Node not found: nonexistent');
  });

  it('throws if removeNodeId does not exist', () => {
    const graph = buildGraphWithNodes([makeNode({ id: 'keep' })]);
    expect(() =>
      mergeNodes(graph, {
        keepNodeId: 'keep',
        removeNodeId: 'nonexistent',
        mergedTitle: 'X',
        reason: 'test',
      }),
    ).toThrow('Node not found: nonexistent');
  });

  it('removes self-loop edges after redirect', () => {
    const graph = buildGraphWithNodes(
      [makeNode({ id: 'keep' }), makeNode({ id: 'remove' })],
      [makeEdge({ from: 'keep', to: 'remove' })],
    );

    const result = mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'Merged',
      reason: 'dup',
    });

    expect(result.edges).toHaveLength(0);
  });

  it('deduplicates edges after redirect', () => {
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

    const result = mergeNodes(graph, {
      keepNodeId: 'keep',
      removeNodeId: 'remove',
      mergedTitle: 'Merged',
      reason: 'dup',
    });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe('keep');
    expect(result.edges[0].to).toBe('other');
  });

  it('does not mutate the original graph', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'keep', title: 'Keep' }),
      makeNode({ id: 'remove', title: 'Remove' }),
    ]);

    const originalNodes = graph.nodes.length;
    mergeNodes(graph, {
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
        makeEdge({ from: 'B', to: 'hub1' }),
        makeEdge({ from: 'A', to: 'hub2' }),
        makeEdge({ from: 'B', to: 'hub2' }),
        makeEdge({ from: 'A', to: 'B' }), // direct edge
      ],
    );

    const missing = findMissingEdges(graph);
    const abPair = missing.find(
      (m) => (m.from === 'A' && m.to === 'B') || (m.from === 'B' && m.to === 'A'),
    );
    expect(abPair).toBeUndefined();
  });

  it('returns empty for a graph with no shared neighbors', () => {
    const graph = buildGraphWithNodes([
      makeNode({ id: 'A', title: 'Node A' }),
      makeNode({ id: 'B', title: 'Node B' }),
    ]);
    expect(findMissingEdges(graph)).toEqual([]);
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
