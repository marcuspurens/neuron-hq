import { describe, it, expect } from 'vitest';
import { pprQuery, type KnowledgeGraph, type KGNode } from '../../src/core/knowledge-graph.js';

function makeIdeaNode(id: string, title: string, description: string): KGNode {
  return {
    id, type: 'idea', title,
    properties: { description, impact: 3, effort: 3, risk: 3, status: 'proposed' },
    confidence: 0.5, scope: 'project-specific', model: null,
    created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
  };
}

describe('graph_ppr MCP tool', () => {
  it('AC31a: returns results in expected output format', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'Test A', 'Alpha'),
        makeIdeaNode('idea-002', 'Test B', 'Beta'),
      ],
      edges: [
        { from: 'idea-001', to: 'idea-002', type: 'related_to', metadata: {} },
      ],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const results = pprQuery(graph, ['idea-001']);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    // Verify shape matches tool output format
    expect(r.node.id).toBe('idea-002');
    expect(r.node.title).toBe('Test B');
    expect(r.node.type).toBe('idea');
    expect(typeof r.score).toBe('number');
    expect(r.node.confidence).toBe(0.5);
  });

  it('AC31b: error on invalid seed returns error message pattern', () => {
    const graph: KnowledgeGraph = {
      version: '1.0', nodes: [], edges: [], lastUpdated: '2026-01-01T00:00:00Z',
    };
    try {
      pprQuery(graph, ['nonexistent']);
      expect.fail('Should have thrown');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      // MCP tool would wrap this as { error: message }
      expect(message).toContain('Node not found: nonexistent');
    }
  });
});
