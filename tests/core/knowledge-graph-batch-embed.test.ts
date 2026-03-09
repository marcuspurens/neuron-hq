import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockIsEmbeddingAvailable = vi.fn();
const mockEmbedBatch = vi.fn();
const mockEmbed = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
  isDbAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: () => mockIsEmbeddingAvailable(),
  getEmbeddingProvider: vi.fn().mockReturnValue({
    embed: (...args: unknown[]) => mockEmbed(...args),
    embedBatch: (...args: unknown[]) => mockEmbedBatch(...args),
    dimension: 1024,
  }),
}));

import { autoEmbedNodes } from '../../src/core/knowledge-graph.js';

describe('autoEmbedNodes batch embedding', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIsEmbeddingAvailable.mockReset();
    mockEmbedBatch.mockReset();
    mockEmbed.mockReset();
    mockIsEmbeddingAvailable.mockResolvedValue(true);
  });

  it('calls embedBatch instead of embed', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', type: 'pattern', title: 'Pattern 1', properties: {} },
        { id: 'e-1', type: 'error', title: 'Error 1', properties: {} },
      ],
    });
    mockEmbedBatch.mockResolvedValueOnce([[0.1, 0.2], [0.3, 0.4]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedNodes(['p-1', 'e-1']);

    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('respects batch size of 20', async () => {
    const nodes = Array.from({ length: 25 }, (_, i) => ({
      id: `n${i}`, type: 'pattern', title: `Pattern ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    mockEmbedBatch
      .mockResolvedValueOnce(Array(20).fill([0.1, 0.2]))
      .mockResolvedValueOnce(Array(5).fill([0.3, 0.4]));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedNodes(nodes.map(n => n.id));

    expect(mockEmbedBatch).toHaveBeenCalledTimes(2);
    expect(mockEmbedBatch.mock.calls[0][0]).toHaveLength(20);
    expect(mockEmbedBatch.mock.calls[1][0]).toHaveLength(5);
  });

  it('returns early for empty array', async () => {
    await autoEmbedNodes([]);
    expect(mockIsEmbeddingAvailable).not.toHaveBeenCalled();
  });

  it('is non-fatal on embedding error', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p-1', type: 'pattern', title: 'Pattern 1', properties: {} }],
    });
    mockEmbedBatch.mockRejectedValueOnce(new Error('Ollama down'));
    await expect(autoEmbedNodes(['p-1'])).resolves.toBeUndefined();
  });
});
