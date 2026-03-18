import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { KnowledgeGraph } from '../../src/core/knowledge-graph.js';

// Mock db module to avoid real DB connections
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(false),
  getPool: vi.fn(),
}));

// Mock embeddings module
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

/**
 * Build a minimal test graph with idea nodes.
 */
function makeTestGraph(): KnowledgeGraph {
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    nodes: [
      {
        id: 'idea-1',
        type: 'idea',
        title: 'Add caching layer',
        properties: {
          description: 'Add Redis caching',
          impact: 5,
          effort: 2,
          risk: 2,
          priority: 3.2,
          status: 'proposed',
          group: 'performance',
        },
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
        confidence: 0.9,
        scope: 'universal',
      },
      {
        id: 'idea-2',
        type: 'idea',
        title: 'Refactor auth module',
        properties: {
          description: 'Split auth into smaller modules',
          impact: 3,
          effort: 4,
          risk: 3,
          priority: 1.08,
          status: 'accepted',
          group: 'architecture',
        },
        created: '2024-01-02T00:00:00Z',
        updated: '2024-01-02T00:00:00Z',
        confidence: 0.8,
        scope: 'universal',
      },
      {
        id: 'idea-3',
        type: 'idea',
        title: 'Dark mode support',
        properties: {
          description: 'Add dark mode to UI',
          impact: 2,
          effort: 1,
          risk: 1,
          priority: 4.0,
          status: 'rejected',
          group: 'ui',
        },
        created: '2024-01-03T00:00:00Z',
        updated: '2024-01-03T00:00:00Z',
        confidence: 0.7,
        scope: 'universal',
      },
    ],
    edges: [
      {
        from: 'idea-1',
        to: 'idea-2',
        type: 'related_to',
        metadata: {},
      },
    ],
  };
}

// Mock the knowledge-graph module with mutable mock implementations
const mockLoadGraph = vi.fn();
const mockBackfillIdeas = vi.fn();
const mockSaveGraph = vi.fn();
vi.mock('../../src/core/knowledge-graph.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/core/knowledge-graph.js')>();
  return {
    ...orig,
    loadGraph: (...args: unknown[]) => mockLoadGraph(...args),
    backfillIdeas: (...args: unknown[]) => mockBackfillIdeas(...args),
    saveGraph: (...args: unknown[]) => mockSaveGraph(...args),
  };
});

describe('ideasCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockLoadGraph.mockReset();
    mockBackfillIdeas.mockReset();
    mockSaveGraph.mockReset();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('exports ideasCommand function', async () => {
    const mod = await import('../../src/commands/ideas.js');
    expect(mod.ideasCommand).toBeDefined();
    expect(typeof mod.ideasCommand).toBe('function');
  });

  it('runs backfill when --backfill is used', async () => {
    const emptyGraph = {
      version: '1.0.0',
      nodes: [],
      edges: [],
      lastUpdated: new Date().toISOString(),
    };
    mockLoadGraph.mockResolvedValue(emptyGraph);
    mockBackfillIdeas.mockResolvedValue({
      ...emptyGraph,
      nodes: [
        {
          id: 'idea-001',
          type: 'idea',
          title: 'Backfilled idea',
          properties: { description: 'test', status: 'proposed' },
          confidence: 0.5,
          scope: 'project-specific',
          model: null,
          created: '2026-01-01T00:00:00Z',
          updated: '2026-01-01T00:00:00Z',
        },
      ],
    });
    mockSaveGraph.mockResolvedValue(undefined);

    const { ideasCommand } = await import('../../src/commands/ideas.js');
    await ideasCommand({ backfill: true });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Backfill complete'),
    );
    expect(mockBackfillIdeas).toHaveBeenCalled();
    expect(mockSaveGraph).toHaveBeenCalled();
  });

  it('shows no-ideas message when graph is empty', async () => {
    mockLoadGraph.mockResolvedValue({
      version: '1.0.0',
      nodes: [],
      edges: [],
      lastUpdated: new Date().toISOString(),
    });

    const { ideasCommand } = await import('../../src/commands/ideas.js');
    await ideasCommand({});

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('No ideas found'),
    );
  });

  it('renders ranked ideas table for a graph with idea nodes', async () => {
    const testGraph = makeTestGraph();
    mockLoadGraph.mockResolvedValue(testGraph);

    const { ideasCommand } = await import('../../src/commands/ideas.js');
    await ideasCommand({ limit: 10 });

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    // Should show the header
    expect(allOutput).toContain('Ranked Ideas');
    // Should show at least one idea (the proposed/accepted ones, not rejected)
    expect(allOutput).toContain('Add caching layer');
    // rejected idea should not appear (default filter is proposed+accepted)
    expect(allOutput).not.toContain('Dark mode');
  });

  it('filters by group when --group is specified', async () => {
    const testGraph = makeTestGraph();
    mockLoadGraph.mockResolvedValue(testGraph);

    const { ideasCommand } = await import('../../src/commands/ideas.js');
    await ideasCommand({ group: 'architecture', limit: 10 });

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('Refactor auth module');
    expect(allOutput).not.toContain('Add caching layer');
  });

  it('shows rejected ideas when --status rejected', async () => {
    const testGraph = makeTestGraph();
    mockLoadGraph.mockResolvedValue(testGraph);

    const { ideasCommand } = await import('../../src/commands/ideas.js');
    await ideasCommand({ status: 'rejected', limit: 10 });

    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('Dark mode');
    expect(allOutput).not.toContain('Add caching layer');
  });
});
