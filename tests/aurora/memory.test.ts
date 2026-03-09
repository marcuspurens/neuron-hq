import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph, AuroraNode } from '../../src/aurora/aurora-schema.js';
import type { SearchResult } from '../../src/aurora/search.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSearchAurora = vi.fn();
vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
}));

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAddAuroraNode = vi.fn();
const mockAddAuroraEdge = vi.fn();
const mockUpdateAuroraNode = vi.fn();
const mockFindAuroraNodes = vi.fn();
const mockTraverseAurora = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  addAuroraNode: (...args: unknown[]) => mockAddAuroraNode(...args),
  addAuroraEdge: (...args: unknown[]) => mockAddAuroraEdge(...args),
  updateAuroraNode: (...args: unknown[]) => mockUpdateAuroraNode(...args),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
  traverseAurora: (...args: unknown[]) => mockTraverseAurora(...args),
}));

import { remember, recall, memoryStats } from '../../src/aurora/memory.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGraph(nodes: AuroraNode[] = [], edges: AuroraGraph['edges'] = []): AuroraGraph {
  return {
    nodes,
    edges,
    lastUpdated: new Date().toISOString(),
  };
}

function makeNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'node-1',
    type: 'fact',
    title: 'Test fact',
    properties: { text: 'Some text', tags: [], source: null },
    confidence: 0.7,
    scope: 'personal',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'node-1',
    title: 'Test fact',
    type: 'fact',
    similarity: 0.9,
    confidence: 0.7,
    scope: 'personal',
    source: 'semantic',
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();

  // Default: empty graph, no search results
  const emptyGraph = makeGraph();
  mockLoadAuroraGraph.mockResolvedValue(emptyGraph);
  mockSaveAuroraGraph.mockResolvedValue(undefined);
  mockSearchAurora.mockResolvedValue([]);
  mockTraverseAurora.mockReturnValue([]);
  mockFindAuroraNodes.mockReturnValue([]);

  // addAuroraNode, addAuroraEdge, updateAuroraNode should return a graph
  mockAddAuroraNode.mockImplementation((graph: AuroraGraph, _node: AuroraNode) => graph);
  mockAddAuroraEdge.mockImplementation((graph: AuroraGraph) => graph);
  mockUpdateAuroraNode.mockImplementation((graph: AuroraGraph) => graph);
});

/* ------------------------------------------------------------------ */
/*  remember() tests                                                   */
/* ------------------------------------------------------------------ */

describe('remember()', () => {
  it('creates a new fact node when no existing match', async () => {
    mockSearchAurora.mockResolvedValue([]);

    const result = await remember('TypeScript is great');

    expect(result.action).toBe('created');
    expect(result.nodeId).toBeDefined();
    expect(mockAddAuroraNode).toHaveBeenCalledOnce();
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();

    // Verify the node passed to addAuroraNode
    const nodeArg = mockAddAuroraNode.mock.calls[0][1];
    expect(nodeArg.type).toBe('fact');
    expect(nodeArg.scope).toBe('personal');
    expect(nodeArg.properties.text).toBe('TypeScript is great');
    expect(nodeArg.confidence).toBe(0.7);
  });

  it('creates a new preference node', async () => {
    mockSearchAurora.mockResolvedValue([]);

    const result = await remember('I prefer dark mode', { type: 'preference', scope: 'personal' });

    expect(result.action).toBe('created');
    const nodeArg = mockAddAuroraNode.mock.calls[0][1];
    expect(nodeArg.type).toBe('preference');
    expect(nodeArg.scope).toBe('personal');
  });

  it('updates existing node when similarity >= dedupThreshold', async () => {
    const existingNode = makeNode({ id: 'existing-1', confidence: 0.7 });
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'existing-1', similarity: 0.88 }),
    ]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingNode]));

    const result = await remember('TypeScript is great', { dedupThreshold: 0.85 });

    expect(result.action).toBe('updated');
    expect(result.existingNodeId).toBe('existing-1');
    expect(result.similarity).toBe(0.88);
    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('returns duplicate when similarity >= 0.95', async () => {
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'dup-1', similarity: 0.97 }),
    ]);

    const result = await remember('Exact same thing');

    expect(result.action).toBe('duplicate');
    expect(result.existingNodeId).toBe('dup-1');
    expect(result.similarity).toBe(0.97);
    expect(mockAddAuroraNode).not.toHaveBeenCalled();
    expect(mockUpdateAuroraNode).not.toHaveBeenCalled();
    expect(mockSaveAuroraGraph).not.toHaveBeenCalled();
  });

  it('creates related_to edges for medium similarity results', async () => {
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'related-1', similarity: 0.6 }),
      makeSearchResult({ id: 'related-2', similarity: 0.55 }),
    ]);

    const result = await remember('A new related fact');

    expect(result.action).toBe('created');
    expect(mockAddAuroraEdge).toHaveBeenCalledTimes(2);

    // Verify edge types
    const firstEdge = mockAddAuroraEdge.mock.calls[0][1];
    expect(firstEdge.type).toBe('related_to');
    expect(firstEdge.to).toBe('related-1');
  });

  it('falls back to keyword search when searchAurora throws', async () => {
    mockSearchAurora.mockRejectedValue(new Error('DB unavailable'));
    mockFindAuroraNodes.mockReturnValue([]);

    const result = await remember('Fallback fact');

    expect(result.action).toBe('created');
    expect(mockFindAuroraNodes).toHaveBeenCalledOnce();
    expect(mockAddAuroraNode).toHaveBeenCalledOnce();
  });

  it('stores tags and source in properties', async () => {
    mockSearchAurora.mockResolvedValue([]);

    await remember('Tagged fact', { tags: ['ts', 'dev'], source: 'manual' });

    const nodeArg = mockAddAuroraNode.mock.calls[0][1];
    expect(nodeArg.properties.tags).toEqual(['ts', 'dev']);
    expect(nodeArg.properties.source).toBe('manual');
  });

  it('generates truncated title for long text', async () => {
    mockSearchAurora.mockResolvedValue([]);
    const longText = 'This is a very long text that should be truncated at a word boundary to fit within sixty characters limit ok';

    await remember(longText);

    const nodeArg = mockAddAuroraNode.mock.calls[0][1];
    expect(nodeArg.title.length).toBeLessThanOrEqual(63); // 60 + "..."
    expect(nodeArg.title).toContain('...');
  });
});

/* ------------------------------------------------------------------ */
/*  recall() tests                                                     */
/* ------------------------------------------------------------------ */

describe('recall()', () => {
  it('returns relevant memories', async () => {
    const node = makeNode({ id: 'mem-1', properties: { text: 'Hello', tags: ['greeting'], source: null } });
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'mem-1', similarity: 0.8 }),
    ]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));

    const result = await recall('greeting');

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].id).toBe('mem-1');
    expect(result.memories[0].text).toBe('Hello');
    expect(result.memories[0].tags).toEqual(['greeting']);
    expect(result.totalFound).toBe(1);
  });

  it('filters by type', async () => {
    mockSearchAurora.mockResolvedValue([]);

    await recall('test', { type: 'preference' });

    expect(mockSearchAurora).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ type: 'preference' }),
    );
  });

  it('filters by scope', async () => {
    mockSearchAurora.mockResolvedValue([]);

    await recall('test', { scope: 'project' });

    expect(mockSearchAurora).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ scope: 'project' }),
    );
  });

  it('includes related nodes', async () => {
    const node = makeNode({ id: 'mem-1' });
    const relatedNode = makeNode({ id: 'related-1', title: 'Related fact' });
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'mem-1', similarity: 0.8 }),
    ]);
    mockLoadAuroraGraph.mockResolvedValue(
      makeGraph([node, relatedNode], [
        { from: 'mem-1', to: 'related-1', type: 'related_to', metadata: {} },
      ]),
    );
    mockTraverseAurora.mockReturnValue([relatedNode]);

    const result = await recall('test');

    expect(result.memories[0].related).toHaveLength(1);
    expect(result.memories[0].related[0].id).toBe('related-1');
    expect(result.memories[0].related[0].edgeType).toBe('related_to');
  });

  it('returns empty result for no matches', async () => {
    mockSearchAurora.mockResolvedValue([]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph());

    const result = await recall('nonexistent');

    expect(result.memories).toHaveLength(0);
    expect(result.totalFound).toBe(0);
  });

  it('respects limit option', async () => {
    await recall('test', { limit: 5 });

    expect(mockSearchAurora).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ limit: 5 }),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  memoryStats() tests                                                */
/* ------------------------------------------------------------------ */

describe('memoryStats()', () => {
  it('counts facts and preferences', async () => {
    const nodes = [
      makeNode({ id: 'f1', type: 'fact' }),
      makeNode({ id: 'f2', type: 'fact' }),
      makeNode({ id: 'p1', type: 'preference' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const stats = await memoryStats();

    expect(stats.facts).toBe(2);
    expect(stats.preferences).toBe(1);
    expect(stats.total).toBe(3);
  });

  it('calculates avgConfidence', async () => {
    const nodes = [
      makeNode({ id: 'f1', type: 'fact', confidence: 0.8 }),
      makeNode({ id: 'f2', type: 'fact', confidence: 0.6 }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const stats = await memoryStats();

    expect(stats.avgConfidence).toBeCloseTo(0.7, 5);
  });

  it('returns zero avgConfidence for empty database', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph());

    const stats = await memoryStats();

    expect(stats.facts).toBe(0);
    expect(stats.preferences).toBe(0);
    expect(stats.total).toBe(0);
    expect(stats.avgConfidence).toBe(0);
  });

  it('groups by scope', async () => {
    const nodes = [
      makeNode({ id: 'f1', type: 'fact', scope: 'personal' }),
      makeNode({ id: 'f2', type: 'fact', scope: 'personal' }),
      makeNode({ id: 'p1', type: 'preference', scope: 'shared' }),
      makeNode({ id: 'p2', type: 'preference', scope: 'project' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const stats = await memoryStats();

    expect(stats.byScope.personal).toBe(2);
    expect(stats.byScope.shared).toBe(1);
    expect(stats.byScope.project).toBe(1);
  });

  it('excludes non-memory node types', async () => {
    const nodes = [
      makeNode({ id: 'f1', type: 'fact' }),
      makeNode({ id: 'd1', type: 'document' as any }),
      makeNode({ id: 'r1', type: 'research' as any }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const stats = await memoryStats();

    expect(stats.total).toBe(1);
    expect(stats.facts).toBe(1);
  });
});
