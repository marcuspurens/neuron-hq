import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEmptyAuroraGraph,
  addAuroraNode,
  addAuroraEdge,
  findAuroraNodes,
  updateAuroraNode,
  removeAuroraNode,
  applyAuroraConfidenceDecay,
  traverseAurora,
} from '../../src/aurora/aurora-graph.js';
import type { AuroraNode, AuroraEdge, AuroraGraph } from '../../src/aurora/aurora-schema.js';

// --- Helpers ---

function makeNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'doc-001',
    type: 'document',
    title: 'Test Document',
    properties: {},
    confidence: 0.8,
    scope: 'personal',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

function makeEdge(overrides: Partial<AuroraEdge> = {}): AuroraEdge {
  return {
    from: 'a',
    to: 'b',
    type: 'related_to',
    metadata: {},
    ...overrides,
  };
}

// --- Tests ---

describe('Aurora Graph — CRUD', () => {
  let graph: AuroraGraph;

  beforeEach(() => {
    graph = createEmptyAuroraGraph();
  });

  it('createEmptyAuroraGraph returns valid empty graph', () => {
    const g = createEmptyAuroraGraph();
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.lastUpdated).toBeTruthy();
  });

  it('addAuroraNode adds a node', () => {
    const node = makeNode({ id: 'doc-001' });
    const result = addAuroraNode(graph, node);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('doc-001');
  });

  it('addAuroraNode rejects duplicate id', () => {
    const node = makeNode({ id: 'dup' });
    const g = addAuroraNode(graph, node);
    expect(() => addAuroraNode(g, makeNode({ id: 'dup' }))).toThrow('Duplicate node id: dup');
  });

  it('addAuroraNode rejects invalid node (empty title)', () => {
    expect(() =>
      addAuroraNode(graph, { ...makeNode(), title: '' } as AuroraNode),
    ).toThrow();
  });

  it('addAuroraEdge adds an edge between existing nodes', () => {
    let g = addAuroraNode(graph, makeNode({ id: 'a' }));
    g = addAuroraNode(g, makeNode({ id: 'b' }));
    const result = addAuroraEdge(g, makeEdge({ from: 'a', to: 'b' }));
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe('related_to');
  });

  it('addAuroraEdge rejects edge with non-existent from node', () => {
    const g = addAuroraNode(graph, makeNode({ id: 'b' }));
    expect(() => addAuroraEdge(g, makeEdge({ from: 'missing', to: 'b' }))).toThrow('Node not found: missing');
  });

  it('addAuroraEdge rejects edge with non-existent to node', () => {
    const g = addAuroraNode(graph, makeNode({ id: 'a' }));
    expect(() => addAuroraEdge(g, makeEdge({ from: 'a', to: 'missing' }))).toThrow('Node not found: missing');
  });

  it('findAuroraNodes filters by type', () => {
    let g = addAuroraNode(graph, makeNode({ id: 'doc1', type: 'document' }));
    g = addAuroraNode(g, makeNode({ id: 'fact1', type: 'fact', title: 'A fact' }));
    const docs = findAuroraNodes(g, { type: 'document' });
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('doc1');
  });

  it('findAuroraNodes filters by query string', () => {
    let g = addAuroraNode(graph, makeNode({ id: 'doc1', title: 'Machine learning guide' }));
    g = addAuroraNode(g, makeNode({ id: 'doc2', title: 'Cooking recipes' }));
    const results = findAuroraNodes(g, { query: 'machine' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('doc1');
  });

  it('findAuroraNodes filters by scope', () => {
    let g = addAuroraNode(graph, makeNode({ id: 'doc1', scope: 'personal' }));
    g = addAuroraNode(g, makeNode({ id: 'doc2', scope: 'shared' }));
    const results = findAuroraNodes(g, { scope: 'personal' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('doc1');
  });

  it('findAuroraNodes matches query in properties', () => {
    const g = addAuroraNode(graph, makeNode({
      id: 'doc1',
      title: 'Something',
      properties: { content: 'artificial intelligence overview' },
    }));
    const results = findAuroraNodes(g, { query: 'artificial' });
    expect(results).toHaveLength(1);
  });

  it('updateAuroraNode updates confidence and title', () => {
    const g = addAuroraNode(graph, makeNode({ id: 'doc1', confidence: 0.5, title: 'Old Title' }));
    const updated = updateAuroraNode(g, 'doc1', { confidence: 0.9, title: 'New Title' });
    expect(updated.nodes[0].confidence).toBe(0.9);
    expect(updated.nodes[0].title).toBe('New Title');
  });

  it('updateAuroraNode updates properties', () => {
    const g = addAuroraNode(graph, makeNode({ id: 'doc1' }));
    const updated = updateAuroraNode(g, 'doc1', { properties: { tags: ['important'] } });
    expect(updated.nodes[0].properties).toEqual({ tags: ['important'] });
  });

  it('updateAuroraNode throws for non-existent node', () => {
    expect(() => updateAuroraNode(graph, 'ghost', { confidence: 0.5 })).toThrow('Node not found: ghost');
  });

  it('removeAuroraNode removes node and connected edges', () => {
    let g = addAuroraNode(graph, makeNode({ id: 'a', title: 'A' }));
    g = addAuroraNode(g, makeNode({ id: 'b', title: 'B' }));
    g = addAuroraNode(g, makeNode({ id: 'c', title: 'C' }));
    g = addAuroraEdge(g, makeEdge({ from: 'a', to: 'b' }));
    g = addAuroraEdge(g, makeEdge({ from: 'b', to: 'c' }));
    g = addAuroraEdge(g, makeEdge({ from: 'c', to: 'a' }));
    const result = removeAuroraNode(g, 'a');
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe('b');
    expect(result.edges[0].to).toBe('c');
  });

  it('removeAuroraNode throws for non-existent node', () => {
    expect(() => removeAuroraNode(graph, 'ghost')).toThrow('Node not found: ghost');
  });
});

describe('Aurora Graph — Confidence Decay', () => {
  it('decays confidence for old nodes', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const graph = createEmptyAuroraGraph();
    const g = addAuroraNode(graph, makeNode({
      id: 'old-doc',
      confidence: 0.8,
      updated: oldDate.toISOString(),
    }));

    const decayed = applyAuroraConfidenceDecay(g);
    expect(decayed.nodes[0].confidence).toBeLessThan(0.8);
    expect(decayed.nodes[0].confidence).toBeCloseTo(0.72, 2);
  });

  it('does not decay recently updated nodes', () => {
    const graph = createEmptyAuroraGraph();
    const g = addAuroraNode(graph, makeNode({
      id: 'recent-doc',
      confidence: 0.8,
      updated: new Date().toISOString(),
    }));

    const decayed = applyAuroraConfidenceDecay(g);
    expect(decayed.nodes[0].confidence).toBe(0.8);
  });

  it('uses custom decay options', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 5);
    const graph = createEmptyAuroraGraph();
    const g = addAuroraNode(graph, makeNode({
      id: 'doc1',
      confidence: 1.0,
      updated: oldDate.toISOString(),
    }));

    const decayed = applyAuroraConfidenceDecay(g, { inactiveDays: 3, decayFactor: 0.5 });
    expect(decayed.nodes[0].confidence).toBe(0.5);
  });

  it('confidence never goes below 0', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const graph = createEmptyAuroraGraph();
    const g = addAuroraNode(graph, makeNode({
      id: 'doc1',
      confidence: 0.001,
      updated: oldDate.toISOString(),
    }));

    const decayed = applyAuroraConfidenceDecay(g, { decayFactor: 0.1 });
    expect(decayed.nodes[0].confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('Aurora Graph — Traverse', () => {
  it('BFS traverses from start node', () => {
    let graph = createEmptyAuroraGraph();
    graph = addAuroraNode(graph, makeNode({ id: 'a', title: 'A' }));
    graph = addAuroraNode(graph, makeNode({ id: 'b', title: 'B' }));
    graph = addAuroraNode(graph, makeNode({ id: 'c', title: 'C' }));
    graph = addAuroraEdge(graph, makeEdge({ from: 'a', to: 'b', type: 'related_to' }));
    graph = addAuroraEdge(graph, makeEdge({ from: 'a', to: 'c', type: 'derived_from' }));

    const result = traverseAurora(graph, 'a');
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id).sort()).toEqual(['b', 'c']);
  });

  it('traverses bidirectionally', () => {
    let graph = createEmptyAuroraGraph();
    graph = addAuroraNode(graph, makeNode({ id: 'a', title: 'A' }));
    graph = addAuroraNode(graph, makeNode({ id: 'b', title: 'B' }));
    graph = addAuroraEdge(graph, makeEdge({ from: 'b', to: 'a', type: 'related_to' }));

    const result = traverseAurora(graph, 'a');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('respects depth limit', () => {
    let graph = createEmptyAuroraGraph();
    graph = addAuroraNode(graph, makeNode({ id: 'a', title: 'A' }));
    graph = addAuroraNode(graph, makeNode({ id: 'b', title: 'B' }));
    graph = addAuroraNode(graph, makeNode({ id: 'c', title: 'C' }));
    graph = addAuroraEdge(graph, makeEdge({ from: 'a', to: 'b' }));
    graph = addAuroraEdge(graph, makeEdge({ from: 'b', to: 'c' }));

    const depth1 = traverseAurora(graph, 'a', undefined, 1);
    expect(depth1).toHaveLength(1);
    expect(depth1[0].id).toBe('b');

    const depth2 = traverseAurora(graph, 'a', undefined, 2);
    expect(depth2).toHaveLength(2);
  });

  it('filters by edge type', () => {
    let graph = createEmptyAuroraGraph();
    graph = addAuroraNode(graph, makeNode({ id: 'a', title: 'A' }));
    graph = addAuroraNode(graph, makeNode({ id: 'b', title: 'B' }));
    graph = addAuroraNode(graph, makeNode({ id: 'c', title: 'C' }));
    graph = addAuroraEdge(graph, makeEdge({ from: 'a', to: 'b', type: 'references' }));
    graph = addAuroraEdge(graph, makeEdge({ from: 'a', to: 'c', type: 'contradicts' }));

    const result = traverseAurora(graph, 'a', 'references');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });
});

describe('Aurora Graph — Load/Save JSON', () => {
  it('loadAuroraGraph returns empty graph when file does not exist', async () => {
    const { loadAuroraGraph } = await import('../../src/aurora/aurora-graph.js');
    // Use a non-existent path, and mock DB as unavailable
    vi.spyOn(await import('../../src/core/db.js'), 'isDbAvailable').mockResolvedValue(false);
    
    const graph = await loadAuroraGraph('/tmp/nonexistent-aurora-graph-test.json');
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    
    vi.restoreAllMocks();
  });

  it('saveAuroraGraph and loadAuroraGraph roundtrip via JSON', async () => {
    const { saveAuroraGraph, loadAuroraGraph } = await import('../../src/aurora/aurora-graph.js');
    vi.spyOn(await import('../../src/core/db.js'), 'isDbAvailable').mockResolvedValue(false);

    const tmpPath = `/tmp/aurora-graph-test-${Date.now()}.json`;
    let graph = createEmptyAuroraGraph();
    graph = addAuroraNode(graph, makeNode({ id: 'roundtrip-1', title: 'Roundtrip Test' }));

    await saveAuroraGraph(graph, tmpPath);
    const loaded = await loadAuroraGraph(tmpPath);
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0].id).toBe('roundtrip-1');
    expect(loaded.nodes[0].title).toBe('Roundtrip Test');

    // Cleanup
    const fs = await import('fs/promises');
    await fs.unlink(tmpPath).catch(() => {});
    vi.restoreAllMocks();
  });
});
