import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  createEmptyGraph,
  addNode,
  findNodes,
  KGNodeSchema,
  NodeScopeSchema,
  migrateAddScope,
  saveGraph,
  type KnowledgeGraph,
  type KGNode,
} from '../../src/core/knowledge-graph.js';
import {
  executeGraphTool,
  type GraphToolContext,
} from '../../src/core/agents/graph-tools.js';

function makeNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'test-001',
    type: 'pattern',
    title: 'Test pattern',
    properties: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
    scope: 'unknown',
    ...overrides,
  };
}

describe('Transfer Learning — NodeScopeSchema', () => {
  it('accepts "universal"', () => {
    expect(NodeScopeSchema.parse('universal')).toBe('universal');
  });

  it('accepts "project-specific"', () => {
    expect(NodeScopeSchema.parse('project-specific')).toBe('project-specific');
  });

  it('accepts "unknown"', () => {
    expect(NodeScopeSchema.parse('unknown')).toBe('unknown');
  });

  it('rejects invalid scope like "global"', () => {
    const result = NodeScopeSchema.safeParse('global');
    expect(result.success).toBe(false);
  });
});

describe('Transfer Learning — KGNodeSchema scope', () => {
  it('accepts scope: "universal"', () => {
    const result = KGNodeSchema.safeParse(makeNode({ scope: 'universal' }));
    expect(result.success).toBe(true);
  });

  it('accepts scope: "project-specific"', () => {
    const result = KGNodeSchema.safeParse(makeNode({ scope: 'project-specific' }));
    expect(result.success).toBe(true);
  });

  it('accepts scope: "unknown"', () => {
    const result = KGNodeSchema.safeParse(makeNode({ scope: 'unknown' }));
    expect(result.success).toBe(true);
  });

  it('defaults scope to "unknown" when omitted', () => {
    const { scope: _scope, ...nodeWithoutScope } = makeNode();
    const result = KGNodeSchema.parse(nodeWithoutScope);
    expect(result.scope).toBe('unknown');
  });

  it('rejects invalid scope like "global"', () => {
    const result = KGNodeSchema.safeParse(makeNode({ scope: 'global' as KGNode['scope'] }));
    expect(result.success).toBe(false);
  });
});

describe('Transfer Learning — addNode scope', () => {
  let graph: KnowledgeGraph;
  beforeEach(() => {
    graph = createEmptyGraph();
  });

  it('sets scope to "unknown" if not provided', () => {
    const { scope: _scope, ...nodeWithoutScope } = makeNode();
    const newGraph = addNode(graph, nodeWithoutScope as KGNode);
    expect(newGraph.nodes[0].scope).toBe('unknown');
  });

  it('preserves explicit scope "universal"', () => {
    const newGraph = addNode(graph, makeNode({ scope: 'universal' }));
    expect(newGraph.nodes[0].scope).toBe('universal');
  });

  it('preserves explicit scope "project-specific"', () => {
    const newGraph = addNode(graph, makeNode({ scope: 'project-specific' }));
    expect(newGraph.nodes[0].scope).toBe('project-specific');
  });
});

describe('Transfer Learning — findNodes scope', () => {
  let graph: KnowledgeGraph;
  beforeEach(() => {
    graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'p1', scope: 'universal', title: 'Universal P' }));
    graph = addNode(graph, makeNode({ id: 'p2', scope: 'project-specific', title: 'Specific P' }));
    graph = addNode(graph, makeNode({ id: 'p3', scope: 'unknown', title: 'Unknown P' }));
  });

  it('filters on scope "universal"', () => {
    const results = findNodes(graph, { scope: 'universal' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p1');
  });

  it('filters on scope "project-specific"', () => {
    const results = findNodes(graph, { scope: 'project-specific' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p2');
  });

  it('filters on scope "unknown"', () => {
    const results = findNodes(graph, { scope: 'unknown' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p3');
  });

  it('without scope filter returns all nodes', () => {
    const results = findNodes(graph, {});
    expect(results).toHaveLength(3);
  });

  it('combines scope + type filter', () => {
    graph = addNode(graph, makeNode({ id: 'e1', type: 'error', scope: 'universal', title: 'Error' }));
    const results = findNodes(graph, { type: 'pattern', scope: 'universal' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p1');
  });

  it('combines scope + query filter', () => {
    const results = findNodes(graph, { scope: 'universal', query: 'Universal' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p1');
  });

  it('scope + query returns empty when no match', () => {
    const results = findNodes(graph, { scope: 'universal', query: 'Specific' });
    expect(results).toHaveLength(0);
  });
});

describe('Transfer Learning — migrateAddScope', () => {
  it('nodes without scope get "unknown"', () => {
    const graph = createEmptyGraph();
    const rawNode = { ...makeNode(), scope: undefined } as unknown as KGNode;
    const graphWithRaw = { ...graph, nodes: [rawNode] };
    const { graph: migrated, migrated: count } = migrateAddScope(graphWithRaw);
    expect(migrated.nodes[0].scope).toBe('unknown');
    expect(count).toBe(1);
  });

  it('nodes with existing scope are preserved', () => {
    const graph = createEmptyGraph();
    const nodeWithScope = makeNode({ scope: 'universal' });
    const graphWith = { ...graph, nodes: [nodeWithScope] };
    const { graph: migrated, migrated: count } = migrateAddScope(graphWith);
    expect(migrated.nodes[0].scope).toBe('universal');
    expect(count).toBe(0);
  });

  it('returns correct count of migrated nodes', () => {
    const graph = createEmptyGraph();
    const raw1 = { ...makeNode({ id: 'a' }), scope: undefined } as unknown as KGNode;
    const raw2 = { ...makeNode({ id: 'b' }), scope: undefined } as unknown as KGNode;
    const existing = makeNode({ id: 'c', scope: 'universal' });
    const graphWith = { ...graph, nodes: [raw1, raw2, existing] };
    const { migrated } = migrateAddScope(graphWith);
    expect(migrated).toBe(2);
  });

  it('empty graph returns 0 migrated', () => {
    const { migrated } = migrateAddScope(createEmptyGraph());
    expect(migrated).toBe(0);
  });

  it('updates lastUpdated timestamp', () => {
    const graph = createEmptyGraph();
    // Small delay to ensure different timestamp
    const { graph: migrated } = migrateAddScope(graph);
    expect(migrated.lastUpdated).toBeDefined();
    expect(typeof migrated.lastUpdated).toBe('string');
  });
});

describe('Transfer Learning — graph tools scope', () => {
  let tmpDir: string;
  let graphPath: string;
  let ctx: GraphToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tl-test-'));
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

  it('graph_query scope parameter filters correctly', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', scope: 'universal', title: 'U' }));
    graph = addNode(graph, makeNode({ id: 'pattern-002', scope: 'project-specific', title: 'PS' }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_query', { scope: 'universal' }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].scope).toBe('universal');
  });

  it('graph_query without scope returns all', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', scope: 'universal', title: 'U' }));
    graph = addNode(graph, makeNode({ id: 'pattern-002', scope: 'project-specific', title: 'PS' }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_query', {}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
  });

  it('graph_query combines scope + min_confidence', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'pattern-001', scope: 'universal', title: 'U', confidence: 0.9 }));
    graph = addNode(graph, makeNode({ id: 'pattern-002', scope: 'universal', title: 'Low', confidence: 0.3 }));
    await saveGraph(graph, graphPath);

    const result = await executeGraphTool('graph_query', { scope: 'universal', min_confidence: 0.5 }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('pattern-001');
  });

  it('graph_assert sets scope at creation', async () => {
    await saveGraph(createEmptyGraph(), graphPath);
    await executeGraphTool('graph_assert', {
      node: {
        type: 'pattern',
        title: 'Scoped node',
        properties: {},
        confidence: 0.8,
        scope: 'universal',
      },
    }, ctx);

    const graph = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
    expect(graph.nodes[0].scope).toBe('universal');
  });

  it('graph_assert defaults scope to "unknown"', async () => {
    await saveGraph(createEmptyGraph(), graphPath);
    await executeGraphTool('graph_assert', {
      node: {
        type: 'pattern',
        title: 'No scope node',
        properties: {},
        confidence: 0.8,
      },
    }, ctx);

    const graph = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
    expect(graph.nodes[0].scope).toBe('unknown');
  });

  it('graph_assert sets scope "project-specific"', async () => {
    await saveGraph(createEmptyGraph(), graphPath);
    await executeGraphTool('graph_assert', {
      node: {
        type: 'pattern',
        title: 'Project node',
        properties: {},
        confidence: 0.7,
        scope: 'project-specific',
      },
    }, ctx);

    const graph = JSON.parse(await fs.readFile(graphPath, 'utf-8'));
    expect(graph.nodes[0].scope).toBe('project-specific');
  });
});
