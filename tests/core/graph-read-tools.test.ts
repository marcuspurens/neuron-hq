import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  graphReadToolDefinitions,
  graphToolDefinitions,
  executeGraphTool,
  type GraphToolContext,
} from '../../src/core/agents/graph-tools.js';
import {
  createEmptyGraph,
  saveGraph,
  addNode,
  addEdge,
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

describe('graphReadToolDefinitions', () => {
  it('returns exactly 3 tools', () => {
    const tools = graphReadToolDefinitions();
    expect(tools).toHaveLength(3);
  });

  it('returns graph_query, graph_traverse, and graph_semantic_search', () => {
    const tools = graphReadToolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).toContain('graph_query');
    expect(names).toContain('graph_traverse');
    expect(names).toContain('graph_semantic_search');
  });

  it('does NOT include graph_assert', () => {
    const tools = graphReadToolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('graph_assert');
  });

  it('does NOT include graph_update', () => {
    const tools = graphReadToolDefinitions();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('graph_update');
  });

  it('returns subset of graphToolDefinitions', () => {
    const readTools = graphReadToolDefinitions();
    const allTools = graphToolDefinitions();
    for (const rt of readTools) {
      const match = allTools.find((t) => t.name === rt.name);
      expect(match).toBeDefined();
      expect(match!.input_schema).toEqual(rt.input_schema);
    }
  });
});

describe('Read tools per-agent context', () => {
  let tmpDir: string;
  let graphPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kg-read-test-'));
    graphPath = path.join(tmpDir, 'graph.json');
    let graph = createEmptyGraph();
    graph = addNode(
      graph,
      makeNode({ id: 'pattern-001', type: 'pattern', title: 'Small iterations' }),
    );
    graph = addNode(
      graph,
      makeNode({ id: 'error-001', type: 'error', title: 'Timeout bug', confidence: 0.6 }),
    );
    graph = addNode(
      graph,
      makeNode({
        id: 'technique-001',
        type: 'technique',
        title: 'withRetry wrapper',
        confidence: 0.9,
      }),
    );
    graph = addEdge(graph, {
      from: 'technique-001',
      to: 'error-001',
      type: 'solves',
      metadata: {},
    });
    graph = addEdge(graph, {
      from: 'pattern-001',
      to: 'technique-001',
      type: 'related_to',
      metadata: {},
    });
    await saveGraph(graph, graphPath);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeCtx(agent: string): GraphToolContext {
    return {
      graphPath,
      runId: 'test-run-001',
      agent,
      audit: { log: async () => {} },
    };
  }

  it('Manager can call graph_query', async () => {
    const result = await executeGraphTool('graph_query', { type: 'pattern' }, makeCtx('manager'));
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('pattern-001');
  });

  it('Manager can call graph_traverse', async () => {
    // technique-001 has edges to both error-001 (solves) and pattern-001 (related_to, incoming)
    // Use edge_type filter to test specific traversal
    const result = await executeGraphTool(
      'graph_traverse',
      { node_id: 'technique-001', edge_type: 'solves' },
      makeCtx('manager'),
    );
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('error-001');
  });

  it('Implementer can call graph_query with correct agent context', async () => {
    const auditEntries: Record<string, unknown>[] = [];
    const ctx: GraphToolContext = {
      graphPath,
      runId: 'test-run-001',
      agent: 'implementer',
      audit: {
        log: async (entry: Record<string, unknown>) => {
          auditEntries.push(entry);
        },
      },
    };
    await executeGraphTool('graph_query', {}, ctx);
    expect(auditEntries[0].role).toBe('implementer');
    expect(auditEntries[0].tool).toBe('graph_query');
  });

  it('Reviewer can call graph_query', async () => {
    const result = await executeGraphTool('graph_query', { type: 'error' }, makeCtx('reviewer'));
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('error-001');
  });

  it('Researcher can call graph_query', async () => {
    const result = await executeGraphTool(
      'graph_query',
      { type: 'technique' },
      makeCtx('researcher'),
    );
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('technique-001');
  });

  it('graph_query with type filter returns correct nodes', async () => {
    const result = await executeGraphTool('graph_query', { type: 'error' }, makeCtx('manager'));
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('error');
  });

  it('graph_traverse with edge_type returns correct neighbors', async () => {
    const result = await executeGraphTool(
      'graph_traverse',
      { node_id: 'technique-001', edge_type: 'solves' },
      makeCtx('reviewer'),
    );
    const nodes = JSON.parse(result);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('error-001');
  });

  it('read tools do NOT modify graph.json', async () => {
    const contentBefore = await fs.readFile(graphPath, 'utf-8');

    await executeGraphTool('graph_query', { type: 'pattern' }, makeCtx('manager'));
    await executeGraphTool(
      'graph_traverse',
      { node_id: 'pattern-001' },
      makeCtx('implementer'),
    );
    await executeGraphTool('graph_query', { query: 'timeout' }, makeCtx('reviewer'));
    await executeGraphTool(
      'graph_traverse',
      { node_id: 'error-001', edge_type: 'solves' },
      makeCtx('researcher'),
    );

    const contentAfter = await fs.readFile(graphPath, 'utf-8');
    expect(contentAfter).toBe(contentBefore);
  });
});
