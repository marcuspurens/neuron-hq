import { describe, it, expect } from 'vitest';
import { getGraphContextForBrief } from '../../src/core/graph-context.js';
import { createEmptyGraph } from '../../src/core/knowledge-graph.js';
import type { KGNode, NodeType } from '../../src/core/knowledge-graph.js';
import type { BriefContext } from '../../src/core/brief-context-extractor.js';

// ── Helper ───────────────────────────────────────────────

function makeNode(
  overrides: Partial<KGNode> & { id: string; type: NodeType; title: string },
): KGNode {
  return {
    properties: {},
    created: '2026-03-01T00:00:00.000Z',
    updated: '2026-03-01T00:00:00.000Z',
    confidence: 0.8,
    scope: 'universal',
    model: null,
    ...overrides,
  };
}

/** Default brief context for tests. */
function makeBriefContext(overrides: Partial<BriefContext> = {}): BriefContext {
  return {
    keywords: ['graph', 'search'],
    nodeTypes: ['pattern', 'error', 'idea'],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────

describe('getGraphContextForBrief', () => {
  // Test 1: Empty graph
  it('returns empty result for an empty graph', () => {
    const graph = createEmptyGraph();
    const ctx = makeBriefContext();
    const result = getGraphContextForBrief(graph, ctx);

    expect(result.nodes).toEqual([]);
    expect(result.summary).toBe('Inga relevanta noder hittades.');
  });

  // Test 2: Keyword match on title
  it('matches node by keyword in title with high relevance', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({ id: 'p1', type: 'pattern', title: 'Graph traversal pattern' }),
    );
    const ctx = makeBriefContext({ keywords: ['graph'] });
    const result = getGraphContextForBrief(graph, ctx);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].node.id).toBe('p1');
    expect(result.nodes[0].relevance).toBe('high');
    expect(result.nodes[0].source).toBe('keyword');
  });

  // Test 3: Keyword match on properties.description
  it('matches node by keyword in properties.description', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({
        id: 'p2',
        type: 'pattern',
        title: 'Some pattern',
        properties: { description: 'Uses graph algorithms for search' },
      }),
    );
    const ctx = makeBriefContext({ keywords: ['graph'] });
    const result = getGraphContextForBrief(graph, ctx);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].node.id).toBe('p2');
    expect(result.nodes[0].source).toBe('keyword');
  });

  // Test 4: Case-insensitive matching
  it('matches keywords case-insensitively', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({ id: 'p3', type: 'pattern', title: 'PPR Algorithm' }),
    );
    const ctx = makeBriefContext({ keywords: ['ppr'] });
    const result = getGraphContextForBrief(graph, ctx);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].node.id).toBe('p3');
  });

  // Test 5: Node type filtering
  it('excludes nodes whose type is not in briefContext.nodeTypes', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({ id: 't1', type: 'technique', title: 'Graph technique' }),
    );
    // nodeTypes does not include 'technique'
    const ctx = makeBriefContext({
      keywords: ['graph'],
      nodeTypes: ['pattern', 'error'],
    });
    const result = getGraphContextForBrief(graph, ctx);

    expect(result.nodes).toHaveLength(0);
  });

  // Test 6: PPR expansion
  it('expands keyword matches via PPR with medium relevance', () => {
    const graph = createEmptyGraph();
    const seedNode = makeNode({ id: 'n1', type: 'pattern', title: 'Graph pattern' });
    const connectedNode = makeNode({ id: 'n2', type: 'pattern', title: 'Unrelated title' });
    const farNode = makeNode({ id: 'n3', type: 'pattern', title: 'Also unrelated' });
    graph.nodes.push(seedNode, connectedNode, farNode);
    graph.edges.push(
      { from: 'n1', to: 'n2', type: 'related_to', metadata: {} },
      { from: 'n2', to: 'n3', type: 'related_to', metadata: {} },
    );

    const ctx = makeBriefContext({ keywords: ['graph'], nodeTypes: ['pattern'] });
    const result = getGraphContextForBrief(graph, ctx);

    // n1 should be keyword match
    const n1Entry = result.nodes.find((n) => n.node.id === 'n1');
    expect(n1Entry).toBeDefined();
    expect(n1Entry!.relevance).toBe('high');
    expect(n1Entry!.source).toBe('keyword');

    // n2 or n3 should appear via PPR
    const pprNodes = result.nodes.filter((n) => n.source === 'ppr');
    expect(pprNodes.length).toBeGreaterThan(0);
    expect(pprNodes[0].relevance).toBe('medium');
  });

  // Test 7: PPR skipped when 0 keyword matches and no pprSeeds
  it('skips PPR without error when there are 0 keyword matches', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({ id: 'p4', type: 'pattern', title: 'No matching title' }),
    );
    const ctx = makeBriefContext({ keywords: ['nonexistent'] });

    // Should not throw
    const result = getGraphContextForBrief(graph, ctx);
    expect(result.nodes).toHaveLength(0);
  });

  // Test 8: Recent errors sorted by created date
  it('includes recent error nodes sorted by date descending', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({
        id: 'e1',
        type: 'error',
        title: 'Old error',
        created: '2026-01-01T00:00:00.000Z',
      }),
      makeNode({
        id: 'e2',
        type: 'error',
        title: 'Recent error',
        created: '2026-03-15T00:00:00.000Z',
      }),
      makeNode({
        id: 'e3',
        type: 'error',
        title: 'Medium error',
        created: '2026-02-01T00:00:00.000Z',
      }),
    );
    const ctx = makeBriefContext({ keywords: ['nonexistent'] });
    const result = getGraphContextForBrief(graph, ctx);

    const recentNodes = result.nodes.filter((n) => n.source === 'recent');
    expect(recentNodes).toHaveLength(3);
    expect(recentNodes[0].node.id).toBe('e2');
    expect(recentNodes[1].node.id).toBe('e3');
    expect(recentNodes[2].node.id).toBe('e1');
  });

  // Test 9: Deduplication — keyword match takes precedence over recent error
  it('deduplicates: keyword-matched error is not added again as recent', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({
        id: 'e4',
        type: 'error',
        title: 'Graph connection error',
        created: '2026-03-15T00:00:00.000Z',
      }),
    );
    const ctx = makeBriefContext({ keywords: ['graph'], nodeTypes: ['error', 'pattern'] });
    const result = getGraphContextForBrief(graph, ctx);

    // Should appear only once, as keyword match
    const matches = result.nodes.filter((n) => n.node.id === 'e4');
    expect(matches).toHaveLength(1);
    expect(matches[0].relevance).toBe('high');
    expect(matches[0].source).toBe('keyword');
  });

  // Test 10: Max nodes cap
  it('caps results at maxNodes', () => {
    const graph = createEmptyGraph();
    // Add 20 matching pattern nodes
    for (let i = 0; i < 20; i++) {
      graph.nodes.push(
        makeNode({ id: `p${i}`, type: 'pattern', title: `Graph pattern ${i}` }),
      );
    }
    const ctx = makeBriefContext({ keywords: ['graph'], nodeTypes: ['pattern'] });
    const result = getGraphContextForBrief(graph, ctx, { maxNodes: 5 });

    expect(result.nodes).toHaveLength(5);
  });

  // Test 11: Summary format
  it('generates correct summary with counts', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({ id: 'p1', type: 'pattern', title: 'Graph pattern' }),
      makeNode({ id: 'i1', type: 'idea', title: 'Graph idea' }),
      makeNode({
        id: 'e1',
        type: 'error',
        title: 'Some error',
        created: '2026-03-15T00:00:00.000Z',
      }),
    );

    const ctx = makeBriefContext({
      keywords: ['graph'],
      nodeTypes: ['pattern', 'idea', 'error'],
    });
    const result = getGraphContextForBrief(graph, ctx);

    // p1 and i1 matched by keyword, e1 matched by both keyword AND recent
    // e1 matched by keyword since 'error' is in nodeTypes but keyword is 'graph'
    // e1 title is 'Some error' — no keyword match, so it comes from recent
    expect(result.summary).toContain('patterns');
    expect(result.summary).toContain('errors');
    expect(result.summary).toContain('idéer');
    expect(result.summary).toContain('via PPR');
    // Specific format: "Hittade X patterns, Y errors, Z idéer (W via PPR)."
    expect(result.summary).toMatch(
      /^Hittade \d+ patterns, \d+ errors, \d+ idéer \(\d+ via PPR\)\.$/,
    );
  });

  // Test 12: includeErrors: false skips recent error step
  it('skips recent errors when includeErrors is false', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({
        id: 'e5',
        type: 'error',
        title: 'Unmatched error',
        created: '2026-03-15T00:00:00.000Z',
      }),
    );
    const ctx = makeBriefContext({ keywords: ['nonexistent'] });
    const result = getGraphContextForBrief(graph, ctx, { includeErrors: false });

    expect(result.nodes).toHaveLength(0);
    expect(result.summary).toBe('Inga relevanta noder hittades.');
  });

  // Test 13: High relevance nodes sorted before medium
  it('sorts high relevance nodes before medium', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({
        id: 'e6',
        type: 'error',
        title: 'Unrelated error',
        created: '2026-03-15T00:00:00.000Z',
      }),
      makeNode({ id: 'p5', type: 'pattern', title: 'Graph pattern' }),
    );
    const ctx = makeBriefContext({
      keywords: ['graph'],
      nodeTypes: ['pattern', 'error'],
    });
    const result = getGraphContextForBrief(graph, ctx);

    // p5 = keyword (high), e6 = recent (medium)
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    const highIdx = result.nodes.findIndex((n) => n.relevance === 'high');
    const medIdx = result.nodes.findIndex((n) => n.relevance === 'medium');
    expect(highIdx).toBeLessThan(medIdx);
  });

  // Test 14: pprSeeds option triggers PPR even without keyword matches
  it('uses pprSeeds to run PPR even without keyword matches', () => {
    const graph = createEmptyGraph();
    graph.nodes.push(
      makeNode({ id: 's1', type: 'pattern', title: 'Seed node' }),
      makeNode({ id: 's2', type: 'pattern', title: 'Connected node' }),
    );
    graph.edges.push(
      { from: 's1', to: 's2', type: 'related_to', metadata: {} },
    );

    const ctx = makeBriefContext({ keywords: ['nonexistent'], nodeTypes: ['pattern'] });
    const result = getGraphContextForBrief(graph, ctx, { pprSeeds: ['s1'] });

    const pprNodes = result.nodes.filter((n) => n.source === 'ppr');
    expect(pprNodes.length).toBeGreaterThan(0);
    expect(pprNodes[0].node.id).toBe('s2');
  });
});
