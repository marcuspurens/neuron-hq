import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  createEmptyGraph,
  addNode,
  addEdge,
  findNodes,
  saveGraph,
  loadGraph,
  updateNode,
  NodeTypeSchema,
  EdgeTypeSchema,
  KGNodeSchema,
  type KnowledgeGraph,
  type KGNode,
  type KGEdge,
} from '../../src/core/knowledge-graph.js';
import { executeGraphTool, type GraphToolContext } from '../../src/core/agents/graph-tools.js';

// Mock semantic search and embeddings
vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));
vi.mock('../../src/aurora/cross-ref.js', () => ({
  findAuroraMatchesForNeuron: vi.fn().mockResolvedValue([]),
  createCrossRef: vi.fn().mockResolvedValue(undefined),
}));

import { semanticSearch } from '../../src/core/semantic-search.js';
import { isEmbeddingAvailable } from '../../src/core/embeddings.js';
const mockSemanticSearch = semanticSearch as ReturnType<typeof vi.fn>;
const mockIsEmbeddingAvailable = isEmbeddingAvailable as ReturnType<typeof vi.fn>;

// Helper: create a valid idea node
function makeIdeaNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'idea-001',
    type: 'idea',
    title: 'Event batching for agent:text',
    properties: {
      impact: 'medium',
      effort: 'low',
      status: 'proposed',
      source_run: '20260316-1252-neuron-hq',
      description: 'Batch agent:text events to reduce SSE overhead',
      group: 'Performance',
    },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.5,
    scope: 'project-specific',
    ...overrides,
  };
}

function makeRunNode(): KGNode {
  return {
    id: 'run-050',
    type: 'run',
    title: 'Run 20260316-1252-neuron-hq',
    properties: { runId: '20260316-1252-neuron-hq' },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 1.0,
    scope: 'project-specific',
  };
}

function makePatternNode(): KGNode {
  return {
    id: 'pattern-200',
    type: 'pattern',
    title: 'Event batching for performance',
    properties: { keywords: 'event, batching, performance' },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
    scope: 'universal',
  };
}

describe('Idea Nodes Integration', () => {
  let tmpDir: string;
  let graphPath: string;
  let ctx: GraphToolContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'idea-nodes-test-'));
    graphPath = path.join(tmpDir, 'graph.json');
    ctx = {
      graphPath,
      runId: 'test-run',
      agent: 'historian',
      audit: { log: async () => {} },
    };
    mockIsEmbeddingAvailable.mockResolvedValue(false);
    mockSemanticSearch.mockResolvedValue([]);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // --- Schema tests ---

  describe('NodeTypeSchema', () => {
    it('accepts "idea" as a valid node type', () => {
      expect(() => NodeTypeSchema.parse('idea')).not.toThrow();
      expect(NodeTypeSchema.parse('idea')).toBe('idea');
    });

    it('still accepts all original types', () => {
      for (const t of ['pattern', 'error', 'technique', 'run', 'agent']) {
        expect(() => NodeTypeSchema.parse(t)).not.toThrow();
      }
    });

    it('rejects invalid types', () => {
      expect(() => NodeTypeSchema.parse('invalid')).toThrow();
    });
  });

  describe('EdgeTypeSchema', () => {
    it('accepts "inspired_by" as a valid edge type', () => {
      expect(() => EdgeTypeSchema.parse('inspired_by')).not.toThrow();
      expect(EdgeTypeSchema.parse('inspired_by')).toBe('inspired_by');
    });

    it('still accepts all original types', () => {
      for (const t of ['solves', 'discovered_in', 'related_to', 'causes', 'used_by']) {
        expect(() => EdgeTypeSchema.parse(t)).not.toThrow();
      }
    });

    it('rejects invalid types', () => {
      expect(() => EdgeTypeSchema.parse('invalid')).toThrow();
    });
  });

  // --- Idea node creation ---

  describe('idea node CRUD', () => {
    it('creates a valid idea node that passes KGNodeSchema validation', () => {
      const node = makeIdeaNode();
      expect(() => KGNodeSchema.parse(node)).not.toThrow();
    });

    it('idea node has correct properties schema', () => {
      const node = makeIdeaNode();
      expect(node.properties).toEqual(expect.objectContaining({
        impact: expect.stringMatching(/^(low|medium|high)$/),
        effort: expect.stringMatching(/^(low|medium|high)$/),
        status: 'proposed',
        source_run: expect.any(String),
        description: expect.any(String),
      }));
    });

    it('adds idea node to graph successfully', () => {
      let graph = createEmptyGraph();
      const node = makeIdeaNode();
      graph = addNode(graph, node);
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].type).toBe('idea');
      expect(graph.nodes[0].id).toBe('idea-001');
    });

    it('rejects duplicate idea node id', () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeIdeaNode());
      expect(() => addNode(graph, makeIdeaNode())).toThrow('Duplicate node id');
    });
  });

  // --- Edge creation ---

  describe('discovered_in edge', () => {
    it('creates discovered_in edge from idea to run node', () => {
      let graph = createEmptyGraph();
      const runNode = makeRunNode();
      const ideaNode = makeIdeaNode();
      graph = addNode(graph, runNode);
      graph = addNode(graph, ideaNode);
      graph = addEdge(graph, {
        from: 'idea-001',
        to: 'run-050',
        type: 'discovered_in',
        metadata: { runId: 'test-run', agent: 'historian' },
      });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].from).toBe('idea-001');
      expect(graph.edges[0].to).toBe('run-050');
      expect(graph.edges[0].type).toBe('discovered_in');
    });
  });

  describe('inspired_by edge', () => {
    it('creates inspired_by edge from idea to pattern node', () => {
      let graph = createEmptyGraph();
      const patternNode = makePatternNode();
      const ideaNode = makeIdeaNode();
      graph = addNode(graph, patternNode);
      graph = addNode(graph, ideaNode);
      graph = addEdge(graph, {
        from: 'idea-001',
        to: 'pattern-200',
        type: 'inspired_by',
        metadata: { runId: 'test-run', agent: 'historian' },
      });
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].type).toBe('inspired_by');
    });

    it('validates inspired_by edge schema', () => {
      const edge: KGEdge = {
        from: 'idea-001',
        to: 'pattern-200',
        type: 'inspired_by',
        metadata: { runId: 'test', agent: 'historian', timestamp: new Date().toISOString() },
      };
      expect(edge.type).toBe('inspired_by');
    });
  });

  // --- graph_query with type=idea ---

  describe('graph_query with type=idea', () => {
    it('returns only idea nodes when type filter is idea', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeIdeaNode());
      graph = addNode(graph, makePatternNode());
      graph = addNode(graph, makeRunNode());
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool('graph_query', { type: 'idea' }, ctx);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('idea');
      expect(parsed[0].id).toBe('idea-001');
    });

    it('returns idea nodes matching a keyword query', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeIdeaNode());
      graph = addNode(graph, makeIdeaNode({ id: 'idea-002', title: 'Improve logging' }));
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool('graph_query', { type: 'idea', query: 'batching' }, ctx);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toContain('batching');
    });

    it('filters idea nodes by min_confidence', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeIdeaNode({ confidence: 0.3 }));
      graph = addNode(graph, makeIdeaNode({ id: 'idea-002', title: 'High conf idea', confidence: 0.9 }));
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool('graph_query', { type: 'idea', min_confidence: 0.5 }, ctx);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  // --- findNodes with idea type ---

  describe('findNodes', () => {
    it('finds idea nodes by type', () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeIdeaNode());
      graph = addNode(graph, makePatternNode());
      const results = findNodes(graph, { type: 'idea' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('idea');
    });
  });

  // --- Dedup simulation ---

  describe('dedup behavior', () => {
    it('simulates dedup: when similar idea exists, update instead of create', () => {
      let graph = createEmptyGraph();
      const existing = makeIdeaNode({ confidence: 0.5 });
      graph = addNode(graph, existing);

      // Simulate dedup: found existing, update it
      const newConfidence = Math.min(existing.confidence + 0.1, 1.0);
      graph = updateNode(graph, 'idea-001', {
        confidence: newConfidence,
        properties: {
          ...existing.properties,
          last_seen_run: 'new-run-id',
          mention_count: 2,
        },
      });

      expect(graph.nodes).toHaveLength(1); // No duplicate created
      expect(graph.nodes[0].confidence).toBe(0.6);
      expect(graph.nodes[0].properties.mention_count).toBe(2);
      expect(graph.nodes[0].properties.last_seen_run).toBe('new-run-id');
    });

    it('creates new node when no duplicate found', () => {
      let graph = createEmptyGraph();
      const node = makeIdeaNode();
      graph = addNode(graph, node);
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].confidence).toBe(0.5);
    });
  });

  // --- graph_assert with idea type ---

  describe('graph_assert with idea type', () => {
    it('creates an idea node via graph_assert', async () => {
      const graph = createEmptyGraph();
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool('graph_assert', {
        node: {
          type: 'idea',
          title: 'New idea via graph_assert',
          properties: {
            impact: 'high',
            effort: 'low',
            status: 'proposed',
            source_run: 'test-run',
            description: 'Test idea',
          },
          confidence: 0.5,
          scope: 'project-specific',
        },
      }, ctx);

      expect(result).toContain('created');

      const updatedGraph = await loadGraph(graphPath);
      const ideaNodes = updatedGraph.nodes.filter(n => n.type === 'idea');
      expect(ideaNodes).toHaveLength(1);
      expect(ideaNodes[0].title).toBe('New idea via graph_assert');
    });
  });

  // --- traverse with inspired_by ---

  describe('traverse with inspired_by', () => {
    it('traverses inspired_by edges from idea to pattern', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makePatternNode());
      graph = addNode(graph, makeIdeaNode());
      graph = addEdge(graph, {
        from: 'idea-001',
        to: 'pattern-200',
        type: 'inspired_by',
        metadata: {},
      });
      await saveGraph(graph, graphPath);

      const result = await executeGraphTool('graph_traverse', {
        node_id: 'idea-001',
        edge_type: 'inspired_by',
      }, ctx);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('pattern-200');
    });
  });
});
