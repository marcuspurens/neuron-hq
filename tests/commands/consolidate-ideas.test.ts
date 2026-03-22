import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the knowledge-graph module
vi.mock('../../src/core/knowledge-graph.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/knowledge-graph.js')>('../../src/core/knowledge-graph.js');
  return {
    ...actual,
    loadGraph: vi.fn(),
    saveGraph: vi.fn(),
  };
});

import { consolidateIdeasCommand } from '../../src/commands/consolidate-ideas.js';
import { loadGraph, saveGraph, createEmptyGraph, addNode, type KGNode } from '../../src/core/knowledge-graph.js';

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
 * Build a graph with 5+ similar ideas that will cluster together.
 */
function buildTestGraphWithSimilarIdeas() {
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

describe('consolidateIdeasCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('dry-run does not call saveGraph', async () => {
    const graph = buildTestGraphWithSimilarIdeas();
    vi.mocked(loadGraph).mockResolvedValue(graph);

    await consolidateIdeasCommand({ dryRun: true });

    expect(saveGraph).not.toHaveBeenCalled();
  });

  it('non-dry-run calls saveGraph', async () => {
    const graph = buildTestGraphWithSimilarIdeas();
    vi.mocked(loadGraph).mockResolvedValue(graph);
    vi.mocked(saveGraph).mockResolvedValue(undefined);

    await consolidateIdeasCommand({ dryRun: false });

    expect(saveGraph).toHaveBeenCalledOnce();
  });

  it('outputs report to console with Idékonsolidering', async () => {
    const graph = buildTestGraphWithSimilarIdeas();
    vi.mocked(loadGraph).mockResolvedValue(graph);

    await consolidateIdeasCommand({ dryRun: true });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Idékonsolidering'),
    );
  });

  it('custom threshold is passed through without error', async () => {
    const graph = buildTestGraphWithSimilarIdeas();
    vi.mocked(loadGraph).mockResolvedValue(graph);

    await expect(
      consolidateIdeasCommand({ threshold: '0.5', dryRun: true }),
    ).resolves.not.toThrow();
  });

  it('handles empty graph without throwing', async () => {
    vi.mocked(loadGraph).mockResolvedValue(createEmptyGraph());

    await expect(
      consolidateIdeasCommand({ dryRun: true }),
    ).resolves.not.toThrow();
  });
});
