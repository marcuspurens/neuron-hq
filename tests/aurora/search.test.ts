import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSemanticSearch = vi.fn();
vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: (...args: unknown[]) => mockSemanticSearch(...args),
}));

const mockLoadAuroraGraph = vi.fn();
const mockFindAuroraNodes = vi.fn();
const mockTraverseAurora = vi.fn();
vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: () => mockLoadAuroraGraph(),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
  traverseAurora: (...args: unknown[]) => mockTraverseAurora(...args),
}));

import { searchAurora } from '../../src/aurora/search.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const sampleGraph = {
  nodes: [
    {
      id: 'doc-1',
      type: 'document',
      title: 'Test Doc',
      properties: { text: 'Hello world' },
      confidence: 0.8,
      scope: 'personal',
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'doc-2',
      type: 'document',
      title: 'Related Doc',
      properties: { text: 'Related content' },
      confidence: 0.7,
      scope: 'personal',
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
    },
  ],
  edges: [
    { from: 'doc-1', to: 'doc-2', type: 'references', metadata: {} },
  ],
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('searchAurora', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns semantic search results when available', async () => {
    mockSemanticSearch.mockResolvedValue([
      { id: 'doc-1', title: 'Test Doc', type: 'document', similarity: 0.9, confidence: 0.8, scope: 'personal' },
      { id: 'doc-2', title: 'Related Doc', type: 'document', similarity: 0.7, confidence: 0.7, scope: 'personal' },
    ]);
    mockLoadAuroraGraph.mockResolvedValue(sampleGraph);
    mockTraverseAurora.mockReturnValue([]);

    const results = await searchAurora('hello');

    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('semantic');
    expect(results[0].similarity).toBe(0.9);
    expect(results[0].text).toBe('Hello world');
    expect(results[1].source).toBe('semantic');
    expect(results[1].text).toBe('Related content');
  });

  it('falls back to keyword search on semantic error', async () => {
    mockSemanticSearch.mockRejectedValue(new Error('No Postgres'));
    mockLoadAuroraGraph.mockResolvedValue(sampleGraph);
    mockFindAuroraNodes.mockReturnValue(sampleGraph.nodes);
    mockTraverseAurora.mockReturnValue([]);

    const results = await searchAurora('hello');

    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('keyword');
    expect(results[0].similarity).toBeNull();
    expect(results[1].source).toBe('keyword');
    expect(results[1].similarity).toBeNull();
  });

  it('includes related nodes via traversal', async () => {
    mockSemanticSearch.mockResolvedValue([
      { id: 'doc-1', title: 'Test Doc', type: 'document', similarity: 0.9, confidence: 0.8, scope: 'personal' },
    ]);
    mockLoadAuroraGraph.mockResolvedValue(sampleGraph);
    mockTraverseAurora.mockReturnValue([sampleGraph.nodes[1]]);

    const results = await searchAurora('hello');

    expect(results).toHaveLength(1);
    expect(results[0].related).toBeDefined();
    expect(results[0].related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'doc-2',
          title: 'Related Doc',
          edgeType: 'references',
        }),
      ]),
    );
  });

  it('deduplicates nodes in related array', async () => {
    mockSemanticSearch.mockResolvedValue([
      { id: 'doc-1', title: 'Test Doc', type: 'document', similarity: 0.9, confidence: 0.8, scope: 'personal' },
      { id: 'doc-2', title: 'Related Doc', type: 'document', similarity: 0.7, confidence: 0.7, scope: 'personal' },
    ]);
    mockLoadAuroraGraph.mockResolvedValue(sampleGraph);
    // For doc-1, traversal returns doc-2 (which is also a primary result)
    mockTraverseAurora.mockImplementation((_graph, nodeId) => {
      if (nodeId === 'doc-1') return [sampleGraph.nodes[1]];
      return [];
    });

    const results = await searchAurora('hello');

    const docOneResult = results.find((r) => r.id === 'doc-1');
    expect(docOneResult).toBeDefined();
    // doc-2 is a primary result so should NOT appear in doc-1's related
    expect(docOneResult!.related).toBeUndefined();
  });

  it('skips traversal when includeRelated is false', async () => {
    mockSemanticSearch.mockResolvedValue([
      { id: 'doc-1', title: 'Test Doc', type: 'document', similarity: 0.9, confidence: 0.8, scope: 'personal' },
    ]);
    mockLoadAuroraGraph.mockResolvedValue(sampleGraph);

    const results = await searchAurora('hello', { includeRelated: false });

    expect(mockTraverseAurora).not.toHaveBeenCalled();
    expect(results[0].text).toBe('Hello world');
  });

  it('respects limit and type options', async () => {
    mockSemanticSearch.mockResolvedValue([]);
    mockLoadAuroraGraph.mockResolvedValue(sampleGraph);

    await searchAurora('hello', { limit: 5, type: 'fact' });

    expect(mockSemanticSearch).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ limit: 5, type: 'fact' }),
    );
  });

  it('handles complete failure gracefully', async () => {
    mockSemanticSearch.mockRejectedValue(new Error('No Postgres'));
    mockLoadAuroraGraph.mockRejectedValue(new Error('File not found'));

    await expect(searchAurora('hello')).rejects.toThrow();
  });
});
