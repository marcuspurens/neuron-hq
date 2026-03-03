import { describe, it, expect, vi, beforeEach } from 'vitest';
import { semanticSearch, findSimilarNodes } from '../../src/core/semantic-search.js';

// Mock the embeddings module
vi.mock('../../src/core/embeddings.js', () => ({
  getEmbeddingProvider: vi.fn().mockReturnValue({
    embed: vi.fn().mockResolvedValue(Array.from({ length: 768 }, () => 0.1)),
    embedBatch: vi.fn(),
    dimension: 768,
  }),
}));

// Mock the db module
const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
}));

describe('semanticSearch', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns sorted results from DB query', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', title: 'Pattern A', type: 'pattern', similarity: 0.95, confidence: 0.8, scope: 'universal' },
        { id: 'p-2', title: 'Pattern B', type: 'pattern', similarity: 0.85, confidence: 0.7, scope: 'unknown' },
      ],
    });

    const results = await semanticSearch('retry logic');

    expect(results.length).toBe(2);
    expect(results[0].id).toBe('p-1');
    expect(results[0].similarity).toBe(0.95);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('applies type filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await semanticSearch('test', { type: 'error' });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('AND type =');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('error');
  });

  it('applies scope filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await semanticSearch('test', { scope: 'universal' });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('AND scope =');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('universal');
  });

  it('applies minSimilarity filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await semanticSearch('test', { minSimilarity: 0.9 });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain(0.9);
  });

  it('applies limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await semanticSearch('test', { limit: 5 });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain(5);
  });

  it('uses default limit of 10 and minSimilarity of 0.7', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await semanticSearch('test');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain(10);
    expect(params).toContain(0.7);
  });

  it('returns empty array when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const results = await semanticSearch('obscure query');
    expect(results).toEqual([]);
  });

  it('combines type and scope filters', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await semanticSearch('test', { type: 'pattern', scope: 'universal' });

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('AND type =');
    expect(sql).toContain('AND scope =');
  });
});

describe('findSimilarNodes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('finds similar nodes excluding self', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-2', title: 'Similar Pattern', type: 'pattern', similarity: 0.92, confidence: 0.8, scope: 'universal' },
      ],
    });

    const results = await findSimilarNodes('p-1');

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('p-2');
    
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('b.id != $1');
    expect(sql).toContain('a.id = $1');
  });

  it('uses default limit 5 and minSimilarity 0.8', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await findSimilarNodes('p-1');

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('p-1');
    expect(params).toContain(0.8);
    expect(params).toContain(5);
  });

  it('accepts custom limit and minSimilarity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await findSimilarNodes('p-1', { limit: 3, minSimilarity: 0.9 });

    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain(0.9);
    expect(params).toContain(3);
  });

  it('returns empty when no similar nodes exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const results = await findSimilarNodes('nonexistent');
    expect(results).toEqual([]);
  });
});
