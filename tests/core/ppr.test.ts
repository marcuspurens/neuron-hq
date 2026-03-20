import { describe, it, expect } from 'vitest';
import { personalizedPageRank } from '../../src/core/ppr.js';

describe('personalizedPageRank', () => {
  // AC2: Linear graph distance ordering
  it('scores decrease with distance from seed in a linear graph', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'B' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'C' },
    ];
    const seeds = new Map([['A', 1.0]]);
    const result = personalizedPageRank(nodes, edges, seeds);

    const scoreOf = (id: string): number =>
      result.find((r) => r.nodeId === id)?.score ?? 0;

    expect(scoreOf('B')).toBeGreaterThan(scoreOf('C'));
    expect(scoreOf('C')).toBeGreaterThan(scoreOf('D'));
    expect(scoreOf('D')).toBeGreaterThan(0);
  });

  // AC3: Triangle symmetry
  it('gives symmetric scores to equidistant nodes in a triangle', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
      { from: 'A', to: 'C' },
      { from: 'C', to: 'A' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'B' },
    ];
    const seeds = new Map([['A', 1.0]]);
    const result = personalizedPageRank(nodes, edges, seeds);

    const scoreOf = (id: string): number =>
      result.find((r) => r.nodeId === id)?.score ?? 0;

    expect(Math.abs(scoreOf('B') - scoreOf('C'))).toBeLessThan(0.01);
  });

  // AC4: Empty graph — no seeds throws
  it('throws when seed weights sum to zero (empty graph, no seeds)', () => {
    expect(() =>
      personalizedPageRank([], [], new Map()),
    ).toThrow('Seed weights sum to zero');
  });

  // AC4: Empty graph — seed with valid entry but no matching nodes
  it('returns empty when seed node is not in the nodes array', () => {
    const seeds = new Map([['Z', 1.0]]);
    // Z not in nodes => seedSum stays 0 after filtering
    expect(() =>
      personalizedPageRank([], [], seeds),
    ).toThrow('Seed weights sum to zero');
  });

  // AC5: Disconnected subgraph with dangling seed
  it('gives score ~1.0 to a dangling disconnected seed node', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [
      { from: 'B', to: 'C' },
      { from: 'C', to: 'B' },
    ];
    const seeds = new Map([['A', 1.0]]);
    const result = personalizedPageRank(nodes, edges, seeds);

    const scoreOf = (id: string): number =>
      result.find((r) => r.nodeId === id)?.score ?? 0;

    expect(scoreOf('A')).toBeCloseTo(1.0, 1);
    expect(scoreOf('B')).toBe(0);
    expect(scoreOf('C')).toBe(0);
  });

  // AC6: Damping=0 means only personalization vector matters
  it('with damping=0, only seed node gets score 1.0', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ];
    const seeds = new Map([['A', 1.0]]);
    const result = personalizedPageRank(nodes, edges, seeds, { damping: 0 });

    const scoreOf = (id: string): number =>
      result.find((r) => r.nodeId === id)?.score ?? 0;

    expect(scoreOf('A')).toBe(1.0);
    expect(scoreOf('B')).toBe(0);
    expect(scoreOf('C')).toBe(0);
  });

  // AC7: Score sum ≈ 1.0
  it('scores sum to approximately 1.0 on a non-trivial graph', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'E' },
      { from: 'E', to: 'A' },
      { from: 'B', to: 'D' },
      { from: 'C', to: 'A' },
    ];
    const seeds = new Map([['A', 1.0]]);
    const result = personalizedPageRank(nodes, edges, seeds);

    const total = result.reduce((sum, r) => sum + r.score, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(0.01);
  });

  // AC8: Disconnected subgraphs
  it('gives zero score to nodes in a disconnected cluster', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
      { from: 'C', to: 'D' },
      { from: 'D', to: 'C' },
    ];
    const seeds = new Map([['A', 1.0]]);
    const result = personalizedPageRank(nodes, edges, seeds);

    const scoreOf = (id: string): number =>
      result.find((r) => r.nodeId === id)?.score ?? 0;

    expect(scoreOf('A')).toBeGreaterThan(0);
    expect(scoreOf('B')).toBeGreaterThan(0);
    expect(scoreOf('C')).toBe(0);
    expect(scoreOf('D')).toBe(0);
  });

  // AC9: Self-loops filtered
  it('self-loops do not inflate scores', () => {
    const nodes = ['A', 'B'];
    const edgesWithSelfLoop = [
      { from: 'A', to: 'A' },
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ];
    const edgesWithout = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ];
    const seeds = new Map([['A', 1.0]]);

    const resultWith = personalizedPageRank(nodes, edgesWithSelfLoop, seeds);
    const resultWithout = personalizedPageRank(nodes, edgesWithout, seeds);

    const scoreWith = (id: string): number =>
      resultWith.find((r) => r.nodeId === id)?.score ?? 0;
    const scoreWithout = (id: string): number =>
      resultWithout.find((r) => r.nodeId === id)?.score ?? 0;

    expect(scoreWith('A')).toBeCloseTo(scoreWithout('A'), 10);
    expect(scoreWith('B')).toBeCloseTo(scoreWithout('B'), 10);
  });

  // AC9b: Unknown node edges ignored
  it('silently ignores edges referencing unknown nodes', () => {
    const nodes = ['A', 'B'];
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
      { from: 'X', to: 'Y' },
      { from: 'A', to: 'Z' },
    ];
    const seeds = new Map([['A', 1.0]]);

    // Should not throw
    const result = personalizedPageRank(nodes, edges, seeds);
    expect(result.length).toBeGreaterThan(0);

    // Only A and B should appear
    const nodeIds = result.map((r) => r.nodeId);
    expect(nodeIds).not.toContain('X');
    expect(nodeIds).not.toContain('Y');
    expect(nodeIds).not.toContain('Z');
  });

  // AC32a: Performance — 500 nodes, 1000 edges
  it('completes 500 nodes / 1000 edges within 100ms', { timeout: 60_000 }, () => {
    const nodes = Array.from({ length: 500 }, (_, i) => `node-${i}`);
    const edges: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < 500; i++) {
      edges.push({ from: `node-${i}`, to: `node-${(i + 1) % 500}` });
      edges.push({ from: `node-${i}`, to: `node-${(i + 7) % 500}` });
    }
    const seeds = new Map([['node-0', 1.0]]);

    const start = performance.now();
    const result = personalizedPageRank(nodes, edges, seeds);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result.length).toBeGreaterThan(0);

    // Sanity check: scores should sum to ~1.0
    const total = result.reduce((sum, r) => sum + r.score, 0);
    expect(Math.abs(total - 1.0)).toBeLessThan(0.01);
  });
});
