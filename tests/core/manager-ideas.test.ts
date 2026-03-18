import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rankIdeas, type KnowledgeGraph, type KGNode } from '../../src/core/knowledge-graph.js';

describe('Manager ideas integration', () => {
  function makeIdeaNode(id: string, title: string, props: Record<string, unknown>): KGNode {
    return {
      id, type: 'idea', title,
      properties: { description: 'test', status: 'proposed', impact: 3, effort: 3, risk: 3, ...props },
      confidence: 0.5, scope: 'project-specific', model: null,
      created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
    };
  }

  it('rankIdeas returns top 5 ideas for manager prompt', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'MultiWriter for logging', { impact: 5, effort: 1, risk: 1, priority: 5.0 }),
        makeIdeaNode('idea-002', 'Langfuse LogWriter', { impact: 4, effort: 2, risk: 2, priority: 2.56 }),
        makeIdeaNode('idea-003', 'Log rotation', { impact: 3, effort: 3, risk: 3, priority: 1.08 }),
        makeIdeaNode('idea-004', 'Context propagation', { impact: 4, effort: 3, risk: 2, priority: 1.92 }),
        makeIdeaNode('idea-005', 'Batched network writer', { impact: 3, effort: 2, risk: 2, priority: 1.92 }),
        makeIdeaNode('idea-006', 'Low priority idea', { impact: 1, effort: 5, risk: 5, priority: 0.04 }),
      ],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };

    const topIdeas = rankIdeas(graph, { limit: 5, status: ['proposed', 'accepted'] });
    expect(topIdeas).toHaveLength(5);
    expect(topIdeas[0].title).toBe('MultiWriter for logging');
    // idea-006 should not be in top 5
    expect(topIdeas.find(i => i.id === 'idea-006')).toBeUndefined();
  });

  it('formats ideas into prompt section correctly', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'MultiWriter for logging', { impact: 5, effort: 1, risk: 1, priority: 5.0, group: 'logger' }),
      ],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };

    const topIdeas = rankIdeas(graph, { limit: 5, status: ['proposed', 'accepted'] });
    const ideaLines = topIdeas.map((idea, i) => {
      const impact = (idea.properties.impact as number) || 0;
      const effort = (idea.properties.effort as number) || 0;
      const priority = (idea.properties.priority as number) || 0;
      const group = (idea.properties.group as string) || '';
      return `${i + 1}. **${idea.title}** (impact:${impact} effort:${effort} priority:${priority.toFixed(1)}${group ? ` group:${group}` : ''})`;
    });
    const section = `## Relevant Ideas from Previous Runs\n\n${ideaLines.join('\n')}`;
    expect(section).toContain('MultiWriter for logging');
    expect(section).toContain('impact:5');
    expect(section).toContain('group:logger');
  });

  it('returns empty array when no ideas match status filter', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'Done idea', { status: 'done', impact: 5, effort: 1, risk: 1, priority: 5.0 }),
      ],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const topIdeas = rankIdeas(graph, { limit: 5, status: ['proposed', 'accepted'] });
    expect(topIdeas).toHaveLength(0);
  });

  it('gracefully handles empty graph', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const topIdeas = rankIdeas(graph, { limit: 5, status: ['proposed', 'accepted'] });
    expect(topIdeas).toHaveLength(0);
  });
});
