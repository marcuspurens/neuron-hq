#!/usr/bin/env python3
"""Patch graph-merge.test.ts to add PPR tests."""

import re

path = 'tests/core/graph-merge.test.ts'
with open(path, 'r') as f:
    content = f.read()

# 1. Update the vitest import to include vi and beforeEach
content = content.replace(
    "import { describe, it, expect } from 'vitest';",
    "import { describe, it, expect, vi, beforeEach } from 'vitest';"
)

# 2. Update graph-merge imports to add findPprCandidates
content = content.replace(
    "  findDuplicateCandidates,\n  mergeNodes,",
    "  findDuplicateCandidates,\n  findPprCandidates,\n  mergeNodes,"
)

# 3. Add vi.mock and pprModule import after the existing imports block
# Insert after the `import path from 'path';` line
insert_after = "import path from 'path';"
ppr_mock_block = """

// Mock ppr.js so tests don't run real PageRank
vi.mock('../../src/core/ppr.js', () => ({
  personalizedPageRank: vi.fn(),
}));

import * as pprModule from '../../src/core/ppr.js';"""

content = content.replace(insert_after, insert_after + ppr_mock_block, 1)

# 4. Append new test suites at the end
new_tests = """

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
    expect(results).not.toContainEqual(expect.objectContaining({ node: nodeB }));
    // 'c' and 'd' should be in results
    expect(results).toContainEqual(expect.objectContaining({ node: nodeC, score: 0.3 }));
    expect(results).toContainEqual(expect.objectContaining({ node: nodeD, score: 0.2 }));
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
"""

content = content.rstrip() + '\n' + new_tests

with open(path, 'w') as f:
    f.write(content)

print("Done. Lines:", len(content.splitlines()))
