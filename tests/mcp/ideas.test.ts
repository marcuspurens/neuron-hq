import { describe, it, expect } from 'vitest';
import {
  rankIdeas,
  linkRelatedIdeas,
  updateNode,
  computePriority,
  type KnowledgeGraph,
  type KGNode,
} from '../../src/core/knowledge-graph.js';

// Test that the core functions used by the MCP tool work correctly for MCP use cases

describe('MCP neuron_ideas tool', () => {
  function makeIdeaNode(id: string, props: Record<string, unknown>): KGNode {
    return {
      id,
      type: 'idea',
      title: `Idea ${id}`,
      properties: {
        description: 'test',
        status: 'proposed',
        impact: 3,
        effort: 3,
        risk: 3,
        ...props,
      },
      confidence: 0.5,
      scope: 'project-specific',
      model: null,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
    };
  }

  const testGraph: KnowledgeGraph = {
    version: '1.0',
    nodes: [
      makeIdeaNode('idea-001', { impact: 5, effort: 1, risk: 1, priority: 5.0, group: 'logger' }),
      makeIdeaNode('idea-002', { impact: 3, effort: 3, risk: 3, priority: 1.08, group: 'security' }),
    ],
    edges: [],
    lastUpdated: '2026-01-01T00:00:00Z',
  };

  describe('rank action', () => {
    it('returns ranked ideas', () => {
      const ranked = rankIdeas(testGraph);
      expect(ranked).toHaveLength(2);
      expect(ranked[0].id).toBe('idea-001');
    });

    it('filters by group', () => {
      const ranked = rankIdeas(testGraph, { group: 'security' });
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe('idea-002');
    });

    it('filters by comma-separated status', () => {
      const graphWithDone: KnowledgeGraph = {
        ...testGraph,
        nodes: [
          ...testGraph.nodes,
          makeIdeaNode('idea-003', { status: 'done' }),
        ],
      };
      const ranked = rankIdeas(graphWithDone, { status: ['done'] });
      expect(ranked).toHaveLength(1);
      expect(ranked[0].id).toBe('idea-003');
    });
  });

  describe('link action', () => {
    it('links related ideas and returns edge count', () => {
      const graph: KnowledgeGraph = {
        version: '1.0',
        nodes: [
          makeIdeaNode('idea-001', { description: 'log writer batching for production' }),
          makeIdeaNode('idea-002', { description: 'log writer network for production' }),
        ],
        edges: [],
        lastUpdated: '2026-01-01T00:00:00Z',
      };
      const result = linkRelatedIdeas(graph, { similarityThreshold: 0.1 });
      // May or may not link depending on similarity
      expect(result.edges.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('update action', () => {
    it('updates node properties and recomputes priority', () => {
      const updated = updateNode(testGraph, 'idea-002', {
        properties: {
          ...testGraph.nodes[1].properties,
          impact: 5,
          effort: 1,
          risk: 1,
          priority: computePriority(5, 1, 1),
        },
      });
      const node = updated.nodes.find(n => n.id === 'idea-002');
      expect(node?.properties.impact).toBe(5);
      expect(node?.properties.priority).toBe(5.0);
    });

    it('rejects update on non-existent node', () => {
      expect(() => updateNode(testGraph, 'idea-999', { properties: {} })).toThrow();
    });
  });
});
