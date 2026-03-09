import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph, AuroraNode } from '../../src/aurora/aurora-schema.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockLoadAuroraGraph = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
}));

import { timeline } from '../../src/aurora/timeline.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'node-1',
    type: 'fact',
    title: 'Test fact',
    properties: { text: 'Some text' },
    confidence: 0.9,
    scope: 'personal',
    created: '2026-03-09T12:00:00.000Z',
    updated: '2026-03-09T12:00:00.000Z',
    ...overrides,
  };
}

function makeGraph(nodes: AuroraNode[] = []): AuroraGraph {
  return {
    nodes,
    edges: [],
    lastUpdated: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadAuroraGraph.mockResolvedValue(makeGraph());
});

describe('timeline()', () => {
  it('returns nodes sorted by date (newest first)', async () => {
    const nodes = [
      makeNode({ id: 'a', created: '2026-03-01T10:00:00.000Z' }),
      makeNode({ id: 'b', created: '2026-03-09T10:00:00.000Z' }),
      makeNode({ id: 'c', created: '2026-03-05T10:00:00.000Z' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline();

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('b');
    expect(result[1].id).toBe('c');
    expect(result[2].id).toBe('a');
  });

  it('filters by type', async () => {
    const nodes = [
      makeNode({ id: 'f1', type: 'fact' }),
      makeNode({ id: 'd1', type: 'document' }),
      makeNode({ id: 'f2', type: 'fact' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline({ type: 'fact' });

    expect(result).toHaveLength(2);
    expect(result.every((e) => e.type === 'fact')).toBe(true);
  });

  it('filters by scope', async () => {
    const nodes = [
      makeNode({ id: 'p1', scope: 'personal' }),
      makeNode({ id: 's1', scope: 'shared' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline({ scope: 'personal' });

    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe('personal');
  });

  it('filters by since date', async () => {
    const nodes = [
      makeNode({ id: 'old', created: '2026-01-01T00:00:00.000Z' }),
      makeNode({ id: 'new', created: '2026-03-09T12:00:00.000Z' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline({ since: '2026-03-01T00:00:00.000Z' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new');
  });

  it('filters by until date', async () => {
    const nodes = [
      makeNode({ id: 'old', created: '2026-01-01T00:00:00.000Z' }),
      makeNode({ id: 'new', created: '2026-03-09T12:00:00.000Z' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline({ until: '2026-02-01T00:00:00.000Z' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('old');
  });

  it('respects limit option', async () => {
    const nodes = Array.from({ length: 30 }, (_, i) =>
      makeNode({ id: `n${i}`, created: `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline({ limit: 5 });

    expect(result).toHaveLength(5);
  });

  it('defaults to limit 20', async () => {
    const nodes = Array.from({ length: 25 }, (_, i) =>
      makeNode({ id: `n${i}`, created: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline();

    expect(result).toHaveLength(20);
  });

  it('handles empty graph', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    const result = await timeline();

    expect(result).toHaveLength(0);
  });

  it('includes sourceUrl when present', async () => {
    const nodes = [
      makeNode({ id: 'with-source', sourceUrl: 'https://example.com' }),
      makeNode({ id: 'without-source' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await timeline();

    const withSource = result.find((e) => e.id === 'with-source');
    const withoutSource = result.find((e) => e.id === 'without-source');
    expect(withSource?.source).toBe('https://example.com');
    expect(withoutSource?.source).toBeUndefined();
  });

  it('maps all fields correctly', async () => {
    const node = makeNode({
      id: 'test-id',
      title: 'Test Title',
      type: 'fact',
      confidence: 0.8,
      scope: 'shared',
      created: '2026-03-09T12:00:00.000Z',
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));

    const result = await timeline();

    expect(result[0]).toEqual({
      id: 'test-id',
      title: 'Test Title',
      type: 'fact',
      createdAt: '2026-03-09T12:00:00.000Z',
      scope: 'shared',
      confidence: 0.8,
    });
  });
});
