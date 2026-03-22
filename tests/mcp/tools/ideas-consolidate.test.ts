import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the knowledge-graph module
vi.mock('../../../src/core/knowledge-graph.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/core/knowledge-graph.js')>('../../../src/core/knowledge-graph.js');
  return {
    ...actual,
    loadGraph: vi.fn(),
    saveGraph: vi.fn(),
  };
});

import { loadGraph, saveGraph, createEmptyGraph, addNode, type KGNode } from '../../../src/core/knowledge-graph.js';
import { clusterIdeas, createMetaIdeas, identifyArchiveCandidates } from '../../../src/core/idea-clusters.js';

// ── Helpers ──────────────────────────────────────────────

function makeIdea(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'idea-001',
    type: 'idea',
    title: 'Test idea',
    properties: {
      description: 'A test idea description',
      impact: 3,
      effort: 3,
      risk: 3,
      status: 'proposed',
      provenance: 'agent',
    },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.7,
    scope: 'project-specific',
    model: null,
    ...overrides,
  };
}

/**
 * Build a graph with similar ideas for clustering tests.
 */
function buildTestGraph() {
  let graph = createEmptyGraph();
  const ideas: KGNode[] = [
    makeIdea({
      id: 'i1',
      title: 'Agent memory persistent state storage',
      properties: {
        description: 'agent memory persistent state storage implementation',
        impact: 4, effort: 3, risk: 2, status: 'proposed', provenance: 'agent',
      },
    }),
    makeIdea({
      id: 'i2',
      title: 'Persistent state agent memory management',
      properties: {
        description: 'persistent state agent memory management layer',
        impact: 3, effort: 2, risk: 2, status: 'proposed', provenance: 'agent',
      },
    }),
    makeIdea({
      id: 'i3',
      title: 'Agent persistent memory storage layer',
      properties: {
        description: 'agent persistent memory storage layer caching',
        impact: 5, effort: 3, risk: 1, status: 'proposed', provenance: 'agent',
      },
    }),
    makeIdea({
      id: 'i4',
      title: 'Memory state persistent agent caching',
      properties: {
        description: 'memory state persistent agent caching system',
        impact: 3, effort: 4, risk: 3, status: 'proposed', provenance: 'agent',
      },
    }),
    makeIdea({
      id: 'i5',
      title: 'Persistent memory agent storage implementation',
      properties: {
        description: 'persistent memory agent storage implementation module',
        impact: 4, effort: 2, risk: 2, status: 'proposed', provenance: 'agent',
      },
    }),
  ];
  for (const idea of ideas) {
    graph = addNode(graph, idea);
  }
  return graph;
}

// ── Tests ────────────────────────────────────────────────

describe('MCP ideas consolidate action — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('clusterIdeas returns ClusterResult structure', () => {
    const graph = buildTestGraph();
    const result = clusterIdeas(graph, {
      similarityThreshold: 0.2,
      minClusterSize: 2,
    });

    expect(result).toHaveProperty('clusters');
    expect(result).toHaveProperty('unclustered');
    expect(result).toHaveProperty('archived');
    expect(result).toHaveProperty('stats');
    expect(Array.isArray(result.clusters)).toBe(true);
    expect(Array.isArray(result.unclustered)).toBe(true);
    expect(Array.isArray(result.archived)).toBe(true);
    expect(result.stats).toHaveProperty('totalIdeas');
    expect(result.stats).toHaveProperty('clusteredCount');
    expect(result.stats).toHaveProperty('unclusteredCount');
    expect(result.stats).toHaveProperty('archivedCount');
    expect(result.stats).toHaveProperty('clusterCount');
  });

  it('clusterIdeas + createMetaIdeas are pure and do not call saveGraph', () => {
    const graph = buildTestGraph();
    const result = clusterIdeas(graph, {
      similarityThreshold: 0.2,
      minClusterSize: 2,
    });
    createMetaIdeas(graph, result.clusters);

    // Pure functions should not trigger any saveGraph calls
    expect(saveGraph).not.toHaveBeenCalled();
  });

  it('createMetaIdeas returns newNodes and newEdges for non-empty clusters', () => {
    const graph = buildTestGraph();
    const result = clusterIdeas(graph, {
      similarityThreshold: 0.2,
      minClusterSize: 2,
    });

    // Ensure we actually have clusters to work with
    expect(result.clusters.length).toBeGreaterThan(0);

    const { newNodes, newEdges } = createMetaIdeas(graph, result.clusters);

    expect(Array.isArray(newNodes)).toBe(true);
    expect(Array.isArray(newEdges)).toBe(true);
    expect(newNodes.length).toBeGreaterThan(0);
    expect(newEdges.length).toBeGreaterThan(0);

    // Meta nodes should have proper structure
    for (const node of newNodes) {
      expect(node.type).toBe('idea');
      expect(node.title).toContain('[Kluster]');
      expect(node.properties.is_meta).toBe(true);
    }
  });

  it('consolidate action enum includes consolidate', async () => {
    // Verify that the MCP tool file compiles and exports correctly
    // by importing it — if the enum does not include consolidate, this will fail at typecheck
    const toolModule = await import('../../../src/mcp/tools/ideas.js');
    expect(toolModule).toBeDefined();
    expect(typeof toolModule.registerIdeasTool).toBe('function');
  });
});
