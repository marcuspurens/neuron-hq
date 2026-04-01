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

const mockPersonalizedPageRank = vi.fn();
vi.mock('../../src/core/ppr.js', () => ({
  personalizedPageRank: (...args: unknown[]) => mockPersonalizedPageRank(...args),
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
  edges: [{ from: 'doc-1', to: 'doc-2', type: 'references', metadata: {} }],
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('searchAurora', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonalizedPageRank.mockReturnValue([]);
  });

  it('returns semantic search results when available', async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Test Doc',
        type: 'document',
        similarity: 0.9,
        confidence: 0.8,
        scope: 'personal',
      },
      {
        id: 'doc-2',
        title: 'Related Doc',
        type: 'document',
        similarity: 0.7,
        confidence: 0.7,
        scope: 'personal',
      },
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
      {
        id: 'doc-1',
        title: 'Test Doc',
        type: 'document',
        similarity: 0.9,
        confidence: 0.8,
        scope: 'personal',
      },
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
      ])
    );
  });

  it('deduplicates nodes in related array', async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Test Doc',
        type: 'document',
        similarity: 0.9,
        confidence: 0.8,
        scope: 'personal',
      },
      {
        id: 'doc-2',
        title: 'Related Doc',
        type: 'document',
        similarity: 0.7,
        confidence: 0.7,
        scope: 'personal',
      },
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
      {
        id: 'doc-1',
        title: 'Test Doc',
        type: 'document',
        similarity: 0.9,
        confidence: 0.8,
        scope: 'personal',
      },
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
      expect.objectContaining({ limit: 5, type: 'fact' })
    );
  });

  it('handles complete failure gracefully', async () => {
    mockSemanticSearch.mockRejectedValue(new Error('No Postgres'));
    mockLoadAuroraGraph.mockRejectedValue(new Error('File not found'));

    await expect(searchAurora('hello')).rejects.toThrow();
  });

  describe('PPR expansion', () => {
    const graphWithThreeNodes = {
      nodes: [
        {
          id: 'doc-1',
          type: 'document',
          title: 'Test Doc',
          properties: { text: 'Hello' },
          confidence: 0.8,
          scope: 'personal',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'doc-2',
          type: 'document',
          title: 'Related Doc',
          properties: { text: 'Related' },
          confidence: 0.7,
          scope: 'personal',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'doc-3',
          type: 'document',
          title: 'Distant Doc',
          properties: { text: 'Distant content' },
          confidence: 0.6,
          scope: 'personal',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
        },
      ],
      edges: [
        { from: 'doc-1', to: 'doc-2', type: 'references', metadata: {} },
        { from: 'doc-2', to: 'doc-3', type: 'related_to', metadata: {} },
      ],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };

    it('adds PPR-discovered nodes to results', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockReturnValue([]);
      mockPersonalizedPageRank.mockReturnValue([
        { nodeId: 'doc-1', score: 0.5 },
        { nodeId: 'doc-2', score: 0.3 },
        { nodeId: 'doc-3', score: 0.1 },
      ]);

      const results = await searchAurora('hello');

      const pprResults = results.filter((r) => r.source === 'ppr');
      expect(pprResults).toHaveLength(2);
      expect(pprResults[0].id).toBe('doc-2');
      expect(pprResults[1].id).toBe('doc-3');
      expect(pprResults[0].similarity).toBeNull();
    });

    it('excludes nodes already in semantic results', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
        {
          id: 'doc-2',
          title: 'Related Doc',
          type: 'document',
          similarity: 0.7,
          confidence: 0.7,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockReturnValue([]);
      mockPersonalizedPageRank.mockReturnValue([
        { nodeId: 'doc-1', score: 0.5 },
        { nodeId: 'doc-2', score: 0.3 },
        { nodeId: 'doc-3', score: 0.1 },
      ]);

      const results = await searchAurora('hello');

      const pprResults = results.filter((r) => r.source === 'ppr');
      expect(pprResults).toHaveLength(1);
      expect(pprResults[0].id).toBe('doc-3');
    });

    it('respects pprLimit option', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockReturnValue([]);
      mockPersonalizedPageRank.mockReturnValue([
        { nodeId: 'doc-1', score: 0.5 },
        { nodeId: 'doc-2', score: 0.3 },
        { nodeId: 'doc-3', score: 0.1 },
      ]);

      const results = await searchAurora('hello', { pprLimit: 1 });

      const pprResults = results.filter((r) => r.source === 'ppr');
      expect(pprResults).toHaveLength(1);
      expect(pprResults[0].id).toBe('doc-2');
    });

    it('skips PPR when usePpr is false', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockReturnValue([]);

      const results = await searchAurora('hello', { usePpr: false });

      expect(mockPersonalizedPageRank).not.toHaveBeenCalled();
      expect(results.every((r) => r.source !== 'ppr')).toBe(true);
    });

    it('uses similarity scores as PPR seed weights', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
        {
          id: 'doc-2',
          title: 'Related Doc',
          type: 'document',
          similarity: 0.6,
          confidence: 0.7,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockReturnValue([]);
      mockPersonalizedPageRank.mockReturnValue([]);

      await searchAurora('hello');

      expect(mockPersonalizedPageRank).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        new Map([
          ['doc-1', 0.9],
          ['doc-2', 0.6],
        ])
      );
    });

    it('creates bidirectional edges for PPR', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockReturnValue([]);
      mockPersonalizedPageRank.mockReturnValue([]);

      await searchAurora('hello');

      const edges = mockPersonalizedPageRank.mock.calls[0][1] as Array<{
        from: string;
        to: string;
      }>;
      expect(edges).toHaveLength(4);
      expect(edges).toContainEqual({ from: 'doc-1', to: 'doc-2' });
      expect(edges).toContainEqual({ from: 'doc-2', to: 'doc-1' });
      expect(edges).toContainEqual({ from: 'doc-2', to: 'doc-3' });
      expect(edges).toContainEqual({ from: 'doc-3', to: 'doc-2' });
    });

    it('continues gracefully when PPR throws', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockReturnValue([]);
      mockPersonalizedPageRank.mockImplementation(() => {
        throw new Error('PPR failure');
      });

      const results = await searchAurora('hello');

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('semantic');
    });

    it('respects type filter for PPR-discovered nodes', async () => {
      const graphWithMixedTypes = {
        ...graphWithThreeNodes,
        nodes: [
          ...graphWithThreeNodes.nodes.slice(0, 2),
          { ...graphWithThreeNodes.nodes[2], type: 'fact' },
        ],
      };
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithMixedTypes);
      mockTraverseAurora.mockReturnValue([]);
      mockPersonalizedPageRank.mockReturnValue([
        { nodeId: 'doc-1', score: 0.5 },
        { nodeId: 'doc-2', score: 0.3 },
        { nodeId: 'doc-3', score: 0.1 },
      ]);

      const results = await searchAurora('hello', { type: 'document' });

      const pprResults = results.filter((r) => r.source === 'ppr');
      expect(pprResults).toHaveLength(1);
      expect(pprResults[0].id).toBe('doc-2');
    });

    it('skips PPR when no results from semantic/keyword', async () => {
      mockSemanticSearch.mockResolvedValue([]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);

      await searchAurora('hello');

      expect(mockPersonalizedPageRank).not.toHaveBeenCalled();
    });

    it('PPR-expanded nodes get text and related enrichment', async () => {
      mockSemanticSearch.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Test Doc',
          type: 'document',
          similarity: 0.9,
          confidence: 0.8,
          scope: 'personal',
        },
      ]);
      mockLoadAuroraGraph.mockResolvedValue(graphWithThreeNodes);
      mockTraverseAurora.mockImplementation((_graph, nodeId) => {
        if (nodeId === 'doc-3') return [graphWithThreeNodes.nodes[1]];
        return [];
      });
      mockPersonalizedPageRank.mockReturnValue([
        { nodeId: 'doc-1', score: 0.5 },
        { nodeId: 'doc-3', score: 0.2 },
      ]);

      const results = await searchAurora('hello');

      const pprResult = results.find((r) => r.id === 'doc-3');
      expect(pprResult).toBeDefined();
      expect(pprResult!.text).toBe('Distant content');
    });
  });
});
