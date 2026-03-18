import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoEmbedNodes } from '../../src/core/knowledge-graph.js';

// Mock embeddings module
const mockEmbedBatch = vi.fn();
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(true),
  getEmbeddingProvider: vi.fn().mockReturnValue({
    embedBatch: (...args: unknown[]) => mockEmbedBatch(...args),
    dimension: 1024,
  }),
}));

// Mock db module
const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    }),
  }),
  isDbAvailable: vi.fn().mockResolvedValue(true),
}));

describe('autoEmbedNodes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEmbedBatch.mockReset();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('generates embeddings for nodes without one using embedBatch', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'p-1',
        type: 'pattern',
        title: 'Test Pattern',
        properties: { key: 'value' },
      }],
    });

    const fakeEmbedding = Array.from({ length: 1024 }, () => 0.1);
    mockEmbedBatch.mockResolvedValueOnce([fakeEmbedding]);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await autoEmbedNodes(['p-1']);

    expect(mockEmbedBatch).toHaveBeenCalledWith([
      'pattern: Test Pattern. {"key":"value"}'
    ]);
    expect(mockQuery).toHaveBeenCalledTimes(2);
    // Second call should be the batch UPDATE using unnest
    expect(mockQuery.mock.calls[1][0]).toContain('UPDATE kg_nodes');
    expect(mockQuery.mock.calls[1][0]).toContain('unnest');
  });

  it('skips when embedding not available', async () => {
    const { isEmbeddingAvailable } = await import('../../src/core/embeddings.js');
    vi.mocked(isEmbeddingAvailable).mockResolvedValueOnce(false);

    await autoEmbedNodes(['p-1']);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });

  it('does nothing for empty nodeIds', async () => {
    await autoEmbedNodes([]);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('gracefully handles batch embed failure', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', type: 'pattern', title: 'Node 1', properties: {} },
        { id: 'p-2', type: 'pattern', title: 'Node 2', properties: {} },
      ],
    });

    mockEmbedBatch.mockRejectedValueOnce(new Error('Ollama timeout'));

    await autoEmbedNodes(['p-1', 'p-2']);

    // Should warn about batch failure
    const output1 = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output1).toContain('Failed to embed batch');
    // embedBatch called once for the single batch (2 nodes < 20 batch size)
    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
  });

  it('processes multiple nodes in a single batch', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', type: 'pattern', title: 'Node 1', properties: {} },
        { id: 'p-2', type: 'pattern', title: 'Node 2', properties: {} },
      ],
    });

    const fakeEmbedding1 = Array.from({ length: 1024 }, () => 0.1);
    const fakeEmbedding2 = Array.from({ length: 1024 }, () => 0.2);
    mockEmbedBatch.mockResolvedValueOnce([fakeEmbedding1, fakeEmbedding2]);
    mockQuery.mockResolvedValue({ rows: [] });

    await autoEmbedNodes(['p-1', 'p-2']);

    // Should call embedBatch once with both texts
    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    expect(mockEmbedBatch).toHaveBeenCalledWith([
      'pattern: Node 1. {}',
      'pattern: Node 2. {}',
    ]);
    // SELECT + 1 batch UPDATE = 2 queries
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][0]).toContain('UPDATE kg_nodes');
    expect(mockQuery.mock.calls[1][0]).toContain('unnest');
  });

  it('gracefully handles total failure', async () => {
    const { isEmbeddingAvailable } = await import('../../src/core/embeddings.js');
    vi.mocked(isEmbeddingAvailable).mockRejectedValueOnce(new Error('DB error'));

    await autoEmbedNodes(['p-1']);

    const output2 = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output2).toContain('Auto-embed failed');
  });
});
