import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  graphToolDefinitions,
  graphReadToolDefinitions,
  isGraphTool,
  executeGraphTool,
  type GraphToolContext,
} from '../../../src/core/agents/graph-tools.js';
import {
  createEmptyGraph,
  saveGraph,
  addNode,
  addEdge,
  type KGNode,
} from '../../../src/core/knowledge-graph.js';

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock('../../../src/core/semantic-search.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));
vi.mock('../../../src/aurora/cross-ref.js', () => ({
  findAuroraMatchesForNeuron: vi.fn().mockResolvedValue([]),
  createCrossRef: vi.fn().mockResolvedValue(undefined),
}));

import { isEmbeddingAvailable } from '../../../src/core/embeddings.js';
import { findAuroraMatchesForNeuron, createCrossRef } from '../../../src/aurora/cross-ref.js';

const mockIsEmbeddingAvailable = isEmbeddingAvailable as ReturnType<typeof vi.fn>;
const mockFindMatches = findAuroraMatchesForNeuron as ReturnType<typeof vi.fn>;
const mockCreateCrossRef = createCrossRef as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────

function makeNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'pattern-001',
    type: 'pattern',
    title: 'Test pattern',
    properties: { keywords: 'test,unit' },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
    scope: 'unknown',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('graph-tools', () => {
  let tmpDir: string;
  let graphPath: string;
  let ctx: GraphToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-tools-test-'));
    graphPath = path.join(tmpDir, 'graph.json');
    ctx = {
      graphPath,
      runId: 'test-run',
      agent: 'historian',
      audit: { log: async () => {} },
    };
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── graphToolDefinitions ──────────────────────────────────────────

  describe('graphToolDefinitions', () => {
    it('returns 8 tools with the expected names', () => {
      const tools = graphToolDefinitions();
      expect(tools).toHaveLength(8);
      const names = tools.map((t) => t.name);
      expect(names).toEqual([
        'graph_query',
        'graph_traverse',
        'graph_assert',
        'graph_update',
        'graph_semantic_search',
        'graph_cross_ref',
        'graph_ppr',
        'graph_health_check',
      ]);
    });

    it('each tool has name and input_schema', () => {
      const tools = graphToolDefinitions();
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.input_schema).toBeDefined();
        expect(tool.input_schema.type).toBe('object');
      }
    });

    it('graph_assert requires node in input_schema.required', () => {
      const tools = graphToolDefinitions();
      const assertTool = tools.find((t) => t.name === 'graph_assert');
      expect(assertTool).toBeDefined();
      const schema = assertTool!.input_schema as { required?: string[] };
      expect(schema.required).toContain('node');
    });
  });

  // ── graphReadToolDefinitions ──────────────────────────────────────

  describe('graphReadToolDefinitions', () => {
    it('returns only 4 read-only tools', () => {
      const tools = graphReadToolDefinitions();
      expect(tools).toHaveLength(4);
      const names = tools.map((t) => t.name);
      expect(names).toEqual(['graph_query', 'graph_traverse', 'graph_semantic_search', 'graph_ppr']);
    });
  });

  // ── isGraphTool ───────────────────────────────────────────────────

  describe('isGraphTool', () => {
    it('returns true for all 7 graph tool names', () => {
      const toolNames = [
        'graph_query',
        'graph_traverse',
        'graph_assert',
        'graph_update',
        'graph_semantic_search',
        'graph_cross_ref',
        'graph_ppr',
      ];
      for (const name of toolNames) {
        expect(isGraphTool(name)).toBe(true);
      }
    });

    it('returns false for non-graph tool names', () => {
      expect(isGraphTool('bash_exec')).toBe(false);
      expect(isGraphTool('read_file')).toBe(false);
      expect(isGraphTool('')).toBe(false);
      expect(isGraphTool('graph_delete')).toBe(false);
    });
  });

  // ── executeGraphQuery ─────────────────────────────────────────────

  describe('executeGraphQuery', () => {
    it('returns empty array for empty graph', async () => {
      await saveGraph(createEmptyGraph(), graphPath);
      const result = await executeGraphTool('graph_query', {}, ctx);
      const nodes = JSON.parse(result);
      expect(nodes).toHaveLength(0);
    });

    it('filters by scope', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001', scope: 'universal', title: 'Universal' }));
      graph = addNode(graph, makeNode({ id: 'pattern-002', scope: 'project-specific', title: 'Project' }));
      graph = addNode(graph, makeNode({ id: 'pattern-003', scope: 'unknown', title: 'Unknown' }));
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool('graph_query', { scope: 'universal' }, ctx);
      const nodes = JSON.parse(result);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].title).toBe('Universal');
    });

    it('combines type + min_confidence filtering', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001', type: 'pattern', confidence: 0.3 }));
      graph = addNode(graph, makeNode({ id: 'pattern-002', type: 'pattern', confidence: 0.9 }));
      graph = addNode(graph, makeNode({ id: 'error-001', type: 'error', confidence: 0.9 }));
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool(
        'graph_query',
        { type: 'pattern', min_confidence: 0.5 },
        ctx,
      );
      const nodes = JSON.parse(result);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('pattern-002');
    });

    it('returns max 20 nodes', async () => {
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
      expect(nodes.length).toBeLessThanOrEqual(20);
    });
  });

  // ── executeGraphTraverse ──────────────────────────────────────────

  describe('executeGraphTraverse', () => {
    it('returns empty for node with no edges', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001' }));
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool(
        'graph_traverse',
        { node_id: 'pattern-001' },
        ctx,
      );
      const nodes = JSON.parse(result);
      expect(nodes).toHaveLength(0);
    });

    it('clamps depth to max 3 without crashing', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'a', title: 'A' }));
      graph = addNode(graph, makeNode({ id: 'b', title: 'B' }));
      graph = addNode(graph, makeNode({ id: 'c', title: 'C' }));
      graph = addNode(graph, makeNode({ id: 'd', title: 'D' }));
      graph = addEdge(graph, { from: 'a', to: 'b', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'b', to: 'c', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'c', to: 'd', type: 'related_to', metadata: {} });
      await saveGraph(graph, graphPath);

      // Pass depth: 10, should be clamped to 3, and not crash
      const result = await executeGraphTool(
        'graph_traverse',
        { node_id: 'a', depth: 10 },
        ctx,
      );
      const nodes = JSON.parse(result);
      // depth 3 from 'a' should reach b, c, d
      expect(nodes.length).toBeGreaterThanOrEqual(1);
      expect(nodes.length).toBeLessThanOrEqual(3);
    });
  });

  // ── executeGraphAssert ────────────────────────────────────────────

  describe('executeGraphAssert', () => {
    it('auto-generates id with correct prefix and incrementing number', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001' }));
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool(
        'graph_assert',
        {
          node: {
            type: 'pattern',
            title: 'Second Pattern',
            properties: { keywords: 'new' },
            confidence: 0.7,
          },
        },
        ctx,
      );

      expect(result).toContain('pattern-002');
    });

    it('sets scope to unknown when not provided', async () => {
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

      const graph = await (await import('../../../src/core/knowledge-graph.js')).loadGraph(graphPath);
      const node = graph.nodes.find((n) => n.id === 'error-001');
      expect(node).toBeDefined();
      expect(node!.scope).toBe('unknown');
    });
  });

  // ── executeGraphUpdate ────────────────────────────────────────────

  describe('executeGraphUpdate', () => {
    it('throws Node not found for non-existent node id', async () => {
      await saveGraph(createEmptyGraph(), graphPath);

      await expect(
        executeGraphTool('graph_update', { node_id: 'nonexistent-999' }, ctx),
      ).rejects.toThrow('Node not found: nonexistent-999');
    });

    it('updates title without losing existing properties', async () => {
      let graph = createEmptyGraph();
      graph = addNode(
        graph,
        makeNode({
          id: 'pattern-001',
          title: 'Old Title',
          properties: { keywords: 'important', context: 'testing' },
        }),
      );
      await saveGraph(graph, graphPath);

      await executeGraphTool(
        'graph_update',
        { node_id: 'pattern-001', title: 'New Title' },
        ctx,
      );

      const updated = await (await import('../../../src/core/knowledge-graph.js')).loadGraph(graphPath);
      const node = updated.nodes[0];
      expect(node.title).toBe('New Title');
      // Properties should remain untouched
      expect(node.properties.keywords).toBe('important');
      expect(node.properties.context).toBe('testing');
    });
  });

  // ── executeGraphSemanticSearch ────────────────────────────────────

  describe('executeGraphSemanticSearch', () => {
    it('returns not-available message when embeddings unavailable', async () => {
      mockIsEmbeddingAvailable.mockResolvedValueOnce(false);

      const result = await executeGraphTool(
        'graph_semantic_search',
        { query: 'test query' },
        ctx,
      );
      const parsed = JSON.parse(result);
      expect(parsed.results).toEqual([]);
      expect(parsed.message).toContain('not available');
    });
  });

  // ── executeGraphCrossRef ──────────────────────────────────────────

  describe('executeGraphCrossRef', () => {
    it('creates cross-refs only for matches with similarity >= 0.7', async () => {
      mockFindMatches.mockResolvedValueOnce([
        { node: { id: 'aurora-1', title: 'A1', type: 'concept' }, similarity: 0.85 },
        { node: { id: 'aurora-2', title: 'A2', type: 'concept' }, similarity: 0.5 },
      ]);

      const result = await executeGraphTool(
        'graph_cross_ref',
        { neuron_node_id: 'pattern-001' },
        ctx,
      );
      const parsed = JSON.parse(result);

      // Only aurora-1 (0.85) should have crossRefCreated: true
      expect(parsed.matches).toHaveLength(2);
      expect(parsed.matches[0].crossRefCreated).toBe(true);
      expect(parsed.matches[1].crossRefCreated).toBe(false);

      // createCrossRef should have been called only once (for the 0.85 match)
      expect(mockCreateCrossRef).toHaveBeenCalledTimes(1);
      expect(mockCreateCrossRef).toHaveBeenCalledWith(
        'pattern-001',
        'aurora-1',
        'enriches',
        0.85,
        { createdBy: 'historian', runId: 'test-run' },
        'historian-discovery',
      );
    });

    it('handles errors gracefully', async () => {
      mockFindMatches.mockRejectedValueOnce(new Error('Aurora unavailable'));

      const result = await executeGraphTool(
        'graph_cross_ref',
        { neuron_node_id: 'pattern-001' },
        ctx,
      );
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain('Aurora unavailable');
      expect(parsed.matches).toEqual([]);
      expect(parsed.crossRefsCreated).toEqual([]);
    });
  });
  // ── executeGraphPpr ─────────────────────────────────────────────

  describe('executeGraphPpr', () => {
    it('returns related nodes via PPR from seed', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Seed Pattern' }));
      graph = addNode(graph, makeNode({ id: 'error-001', type: 'error', title: 'Related Error' }));
      graph = addEdge(graph, {
        from: 'pattern-001',
        to: 'error-001',
        type: 'solves',
        metadata: {},
      });
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool(
        'graph_ppr',
        { seed_ids: ['pattern-001'] },
        ctx,
      );
      const nodes = JSON.parse(result);
      // Should return error-001 (connected via edge), but not seed itself
      expect(Array.isArray(nodes)).toBe(true);
      const ids = nodes.map((n: { id: string }) => n.id);
      expect(ids).not.toContain('pattern-001'); // seeds excluded by pprQuery
      expect(ids).toContain('error-001');
    });

    it('filters by type when specified', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Seed' }));
      graph = addNode(graph, makeNode({ id: 'error-001', type: 'error', title: 'Error' }));
      graph = addNode(graph, makeNode({ id: 'technique-001', type: 'technique', title: 'Tech' }));
      graph = addEdge(graph, { from: 'pattern-001', to: 'error-001', type: 'solves', metadata: {} });
      graph = addEdge(graph, { from: 'pattern-001', to: 'technique-001', type: 'related_to', metadata: {} });
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool(
        'graph_ppr',
        { seed_ids: ['pattern-001'], type: 'error' },
        ctx,
      );
      const nodes = JSON.parse(result);
      expect(nodes.every((n: { type: string }) => n.type === 'error')).toBe(true);
    });

    it('respects limit parameter', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Seed' }));
      for (let i = 1; i <= 5; i++) {
        const nodeId = `error-${String(i).padStart(3, '0')}`;
        graph = addNode(graph, makeNode({ id: nodeId, type: 'error', title: `Error ${i}` }));
        graph = addEdge(graph, { from: 'pattern-001', to: nodeId, type: 'solves', metadata: {} });
      }
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool(
        'graph_ppr',
        { seed_ids: ['pattern-001'], limit: 2 },
        ctx,
      );
      const nodes = JSON.parse(result);
      expect(nodes.length).toBeLessThanOrEqual(2);
    });

    it('throws on empty seed_ids', async () => {
      await saveGraph(createEmptyGraph(), graphPath);
      await expect(
        executeGraphTool('graph_ppr', { seed_ids: [] }, ctx),
      ).rejects.toThrow('At least one seed node required');
    });

    it('returns score and confidence for each result', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'pattern-001', title: 'Seed' }));
      graph = addNode(graph, makeNode({ id: 'error-001', type: 'error', title: 'E1', confidence: 0.8 }));
      graph = addEdge(graph, { from: 'pattern-001', to: 'error-001', type: 'solves', metadata: {} });
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool(
        'graph_ppr',
        { seed_ids: ['pattern-001'] },
        ctx,
      );
      const nodes = JSON.parse(result);
      if (nodes.length > 0) {
        expect(nodes[0]).toHaveProperty('score');
        expect(nodes[0]).toHaveProperty('confidence');
        expect(nodes[0]).toHaveProperty('id');
        expect(nodes[0]).toHaveProperty('title');
        expect(nodes[0]).toHaveProperty('type');
      }
    });
  });
});
