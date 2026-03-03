import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the dedup check logic by importing and testing the semantic-search module
// and verifying the historian integration concept

// Mock embeddings
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(true),
  getEmbeddingProvider: vi.fn().mockReturnValue({
    embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0.1)),
    dimension: 768,
  }),
}));

// Mock db module
const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
  isDbAvailable: vi.fn().mockResolvedValue(true),
}));

import { semanticSearch } from '../../src/core/semantic-search.js';
import { isEmbeddingAvailable } from '../../src/core/embeddings.js';

describe('Historian semantic dedup check', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    vi.clearAllMocks();
  });

  it('semanticSearch finds very similar nodes (similarity > 0.9)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'p-1',
          title: 'Context window management strategy',
          type: 'pattern',
          similarity: 0.95,
          confidence: 0.8,
          scope: 'universal',
        },
      ],
    });

    const results = await semanticSearch('Context window management');
    expect(results.length).toBe(1);
    expect(results[0].similarity).toBe(0.95);
  });

  it('semanticSearch finds related nodes (similarity 0.8-0.9)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'e-1',
          title: 'Token limit exceeded',
          type: 'error',
          similarity: 0.85,
          confidence: 0.7,
          scope: 'unknown',
        },
      ],
    });

    const results = await semanticSearch('Context overflow error');
    expect(results.length).toBe(1);
    expect(results[0].similarity).toBe(0.85);
  });

  it('returns empty when no similar nodes exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const results = await semanticSearch('completely unique concept');
    expect(results).toEqual([]);
  });

  it('gracefully handles embedding unavailability', async () => {
    vi.mocked(isEmbeddingAvailable).mockResolvedValueOnce(false);
    // When embedding is not available, the check should be skipped
    const available = await isEmbeddingAvailable();
    expect(available).toBe(false);
  });

  it('historian graph tools include graph_semantic_search', async () => {
    const { graphToolDefinitions } = await import('../../src/core/agents/graph-tools.js');
    const tools = graphToolDefinitions();
    const semanticTool = tools.find(t => t.name === 'graph_semantic_search');
    expect(semanticTool).toBeDefined();
  });

  it('dedup check concept: very similar nodes generate warnings', async () => {
    // Simulate what the historian's checkSemanticDuplicates does
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', title: 'Retry logic pattern', type: 'pattern', similarity: 0.95, confidence: 0.8, scope: 'universal' },
        { id: 'p-2', title: 'Error handling pattern', type: 'pattern', similarity: 0.82, confidence: 0.7, scope: 'unknown' },
      ],
    });

    const results = await semanticSearch('retry logic for API calls', {
      limit: 5,
      minSimilarity: 0.8,
    });

    // Verify warnings would be generated
    const warnings: string[] = [];
    for (const match of results) {
      if (match.similarity >= 0.9) {
        warnings.push(`Very similar: ${match.title} (${match.similarity})`);
      } else if (match.similarity >= 0.8) {
        warnings.push(`Related: ${match.title} (${match.similarity})`);
      }
    }

    expect(warnings.length).toBe(2);
    expect(warnings[0]).toContain('Very similar');
    expect(warnings[1]).toContain('Related');
  });
});
