import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  executeGraphTool,
  type GraphToolContext,
} from '../../src/core/agents/graph-tools.js';
import {
  createEmptyGraph,
  saveGraph,
  addNode,
  addEdge,
  loadGraph,
  type KGNode,
} from '../../src/core/knowledge-graph.js';

// --- Helper ---

function makeNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'pattern-001',
    type: 'pattern',
    title: 'Test pattern',
    properties: { keywords: 'test,unit' },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
    ...overrides,
  };
}

describe('Knowledge Graph Tools', () => {
  let tmpDir: string;
  let graphPath: string;
  let ctx: GraphToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kg-tools-test-'));
    graphPath = path.join(tmpDir, 'graph.json');
    ctx = {
      graphPath,
      runId: 'test-run-001',
      agent: 'historian',
      audit: { log: async () => {} },
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --- graph_query tests ---

  it('graph_query returns nodes filtered by type', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', type: 'pattern', title: 'P1' }));
    graph = addNode(graph, makeNode({ id: 'error-001', type: 'error', title: 'E1' }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_query', { type: 'pattern' }, ctx);
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('pattern');
  });

  it('graph_query returns nodes filtered by query text', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Retry mechanism' }));
    graph = addNode(graph, makeNode({ id: 'pattern-002', title: 'Caching strategy' }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_query', { query: 'retry' }, ctx);
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].title).toBe('Retry mechanism');
  });

  it('graph_query filters by min_confidence', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', confidence: 0.3 }));
    graph = addNode(graph, makeNode({ id: 'pattern-002', confidence: 0.9 }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_query', { min_confidence: 0.5 }, ctx);
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].confidence).toBe(0.9);
  });

  it('graph_query returns max 20 nodes', async () => {
    let graph = createEmptyGraph();
    for (let i = 1; i <= 25; i++) {
      graph = addNode(
        graph,
        makeNode({
          id: `pattern-${String(i).padStart(3, '0')}`,
          title: `Pattern ${i}`,
          confidence: i / 25,
        }),
      );
    }
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_query', {}, ctx);
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(20);
  });

  it('graph_query handles non-existent graph file gracefully', async () => {
    // graphPath points to non-existent file — loadGraph returns empty graph
    const result = await executeGraphTool('graph_query', {}, ctx);
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(0);
  });

  // --- graph_traverse tests ---

  it('graph_traverse returns neighbors via edges', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'P1' }));
    graph = addNode(graph, makeNode({ id: 'error-001', type: 'error', title: 'E1' }));
    graph = addEdge(graph, { from: 'pattern-001', to: 'error-001', type: 'solves', metadata: {} });
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_traverse', { node_id: 'pattern-001' }, ctx);
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('error-001');
  });

  it('graph_traverse filters by edge_type', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'P1' }));
    graph = addNode(graph, makeNode({ id: 'error-001', type: 'error', title: 'E1' }));
    graph = addNode(graph, makeNode({ id: 'run-001', type: 'run', title: 'R1' }));
    graph = addEdge(graph, {
      from: 'pattern-001',
      to: 'error-001',
      type: 'solves',
      metadata: {},
    });
    graph = addEdge(graph, {
      from: 'pattern-001',
      to: 'run-001',
      type: 'discovered_in',
      metadata: {},
    });
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool(
      'graph_traverse',
      { node_id: 'pattern-001', edge_type: 'solves' },
      ctx,
    );
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('error-001');
  });

  it('graph_traverse follows multiple depths', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'a', title: 'A' }));
    graph = addNode(graph, makeNode({ id: 'b', title: 'B' }));
    graph = addNode(graph, makeNode({ id: 'c', title: 'C' }));
    graph = addEdge(graph, { from: 'a', to: 'b', type: 'related_to', metadata: {} });
    graph = addEdge(graph, { from: 'b', to: 'c', type: 'related_to', metadata: {} });
    await saveGraph(graph, graphPath);

    // depth=1 should only find b
    const result1 = await executeGraphTool('graph_traverse', { node_id: 'a', depth: 1 }, ctx);
    expect(JSON.parse(result1)).toHaveLength(1);

    // depth=2 should find b and c
    const result2 = await executeGraphTool('graph_traverse', { node_id: 'a', depth: 2 }, ctx);
    expect(JSON.parse(result2)).toHaveLength(2);
  });

  // --- graph_assert tests ---

  it('graph_assert creates node with auto-generated id', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Existing' }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool(
      'graph_assert',
      {
        node: {
          type: 'pattern',
          title: 'New Pattern',
          properties: { keywords: 'new' },
          confidence: 0.7,
        },
      },
      ctx,
    );

    expect(result).toContain('pattern-002');
    expect(result).toContain('0 edges');
  });

  it('graph_assert creates node with edges', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Existing' }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool(
      'graph_assert',
      {
        node: {
          type: 'pattern',
          title: 'New Pattern',
          properties: {},
          confidence: 0.7,
        },
        edges: [{ target_id: 'pattern-001', type: 'related_to' }],
      },
      ctx,
    );

    expect(result).toContain('pattern-002');
    expect(result).toContain('1 edges');
  });

  it('graph_assert sets provenance metadata', async () => {
    await saveGraph(createEmptyGraph(), graphPath);

    await executeGraphTool(
      'graph_assert',
      {
        node: {
          type: 'error',
          title: 'Test Error',
          properties: {},
          confidence: 0.5,
        },
      },
      ctx,
    );

    const graph = await loadGraph(graphPath);
    const node = graph.nodes.find((n) => n.id === 'error-001');
    expect(node).toBeDefined();
    expect(node!.properties.provenance).toEqual(
      expect.objectContaining({
        runId: 'test-run-001',
        agent: 'historian',
      }),
    );
    expect((node!.properties.provenance as Record<string, unknown>).timestamp).toBeDefined();
  });

  it('graph_assert saves to disk', async () => {
    await saveGraph(createEmptyGraph(), graphPath);

    await executeGraphTool(
      'graph_assert',
      {
        node: {
          type: 'technique',
          title: 'New Technique',
          properties: { keywords: 'ml' },
          confidence: 0.6,
        },
      },
      ctx,
    );

    const graph = await loadGraph(graphPath);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].title).toBe('New Technique');
    expect(graph.nodes[0].id).toBe('technique-001');
  });

  it('graph_assert handles empty graph (no existing nodes of type)', async () => {
    await saveGraph(createEmptyGraph(), graphPath);

    const result = await executeGraphTool(
      'graph_assert',
      {
        node: {
          type: 'pattern',
          title: 'First Pattern',
          properties: {},
          confidence: 0.5,
        },
      },
      ctx,
    );

    expect(result).toContain('pattern-001');
  });

  // --- graph_update tests ---

  it('graph_update updates confidence', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', confidence: 0.5 }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool(
      'graph_update',
      { node_id: 'pattern-001', confidence: 0.9 },
      ctx,
    );
    expect(result).toContain('pattern-001 updated');

    const updated = await loadGraph(graphPath);
    expect(updated.nodes[0].confidence).toBe(0.9);
  });

  it('graph_update merges properties (does not replace)', async () => {
    let graph = createEmptyGraph();
    graph = addNode(
      graph,
      makeNode({
        id: 'pattern-001',
        properties: { existing: 'value', keywords: 'old' },
      }),
    );
    await saveGraph(graph, graphPath);

    await executeGraphTool(
      'graph_update',
      {
        node_id: 'pattern-001',
        properties: { keywords: 'new', extra: 'data' },
      },
      ctx,
    );

    const updated = await loadGraph(graphPath);
    expect(updated.nodes[0].properties).toEqual({
      existing: 'value', // preserved
      keywords: 'new', // updated
      extra: 'data', // added
    });
  });

  it('graph_update saves to disk', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Old Title' }));
    await saveGraph(graph, graphPath);

    await executeGraphTool(
      'graph_update',
      { node_id: 'pattern-001', title: 'New Title' },
      ctx,
    );

    const saved = await loadGraph(graphPath);
    expect(saved.nodes[0].title).toBe('New Title');
  });

  // --- Error handling ---

  it('throws on unknown tool name', async () => {
    await expect(
      executeGraphTool('graph_unknown', {}, ctx),
    ).rejects.toThrow('Unknown graph tool: graph_unknown');
  });
});
