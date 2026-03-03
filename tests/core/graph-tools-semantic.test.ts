import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  graphToolDefinitions,
  graphReadToolDefinitions,
  isGraphTool,
  executeGraphTool,
  type GraphToolContext,
} from '../../src/core/agents/graph-tools.js';

// Mock semantic search
vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([
    { id: 'p-1', title: 'Retry Logic', type: 'pattern', similarity: 0.92, confidence: 0.8, scope: 'universal' },
    { id: 'e-1', title: 'API Timeout', type: 'error', similarity: 0.85, confidence: 0.7, scope: 'unknown' },
  ]),
}));

// Mock embeddings
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(true),
  getEmbeddingProvider: vi.fn(),
}));

// Mock knowledge-graph (needed by other graph tools)
vi.mock('../../src/core/knowledge-graph.js', () => ({
  loadGraph: vi.fn().mockResolvedValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
  saveGraph: vi.fn(),
  findNodes: vi.fn().mockReturnValue([]),
  traverse: vi.fn().mockReturnValue([]),
  addNode: vi.fn().mockReturnValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
  addEdge: vi.fn().mockReturnValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
  updateNode: vi.fn().mockReturnValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
}));

// Mock db
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
}));

describe('graph_semantic_search tool', () => {
  const mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
  const ctx: GraphToolContext = {
    graphPath: '/tmp/test-graph.json',
    runId: 'test-run',
    agent: 'manager',
    model: 'test-model',
    audit: mockAudit,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is included in graphToolDefinitions', () => {
    const tools = graphToolDefinitions();
    const semanticTool = tools.find(t => t.name === 'graph_semantic_search');
    expect(semanticTool).toBeDefined();
    expect(semanticTool!.input_schema.required).toContain('query');
  });

  it('is included in graphReadToolDefinitions', () => {
    const tools = graphReadToolDefinitions();
    const names = tools.map(t => t.name);
    expect(names).toContain('graph_semantic_search');
  });

  it('isGraphTool recognizes graph_semantic_search', () => {
    expect(isGraphTool('graph_semantic_search')).toBe(true);
  });

  it('returns semantic search results when available', async () => {
    const result = await executeGraphTool(
      'graph_semantic_search',
      { query: 'retry logic for API calls' },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('p-1');
    expect(parsed[0].similarity).toBe(0.92);
  });

  it('passes type and limit options to semanticSearch', async () => {
    const { semanticSearch } = await import('../../src/core/semantic-search.js');

    await executeGraphTool(
      'graph_semantic_search',
      { query: 'test', type: 'error', limit: 5, min_similarity: 0.8, scope: 'universal' },
      ctx,
    );

    expect(semanticSearch).toHaveBeenCalledWith('test', {
      type: 'error',
      limit: 5,
      minSimilarity: 0.8,
      scope: 'universal',
    });
  });

  it('returns fallback message when embedding not available', async () => {
    const { isEmbeddingAvailable } = await import('../../src/core/embeddings.js');
    vi.mocked(isEmbeddingAvailable).mockResolvedValueOnce(false);

    const result = await executeGraphTool(
      'graph_semantic_search',
      { query: 'test' },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.results).toEqual([]);
    expect(parsed.message).toContain('not available');
  });

  it('handles semanticSearch errors gracefully', async () => {
    const { semanticSearch } = await import('../../src/core/semantic-search.js');
    vi.mocked(semanticSearch).mockRejectedValueOnce(new Error('DB connection lost'));

    const result = await executeGraphTool(
      'graph_semantic_search',
      { query: 'test' },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.results).toEqual([]);
    expect(parsed.message).toContain('failed');
  });

  it('logs audit entries', async () => {
    await executeGraphTool(
      'graph_semantic_search',
      { query: 'retry logic' },
      ctx,
    );

    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'graph_semantic_search',
        allowed: true,
      })
    );
  });
});
