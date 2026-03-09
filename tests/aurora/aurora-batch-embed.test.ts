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

import { autoEmbedAuroraNodes } from '../../src/aurora/aurora-graph.js';

describe('autoEmbedAuroraNodes batch embedding', () => {
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
        { id: 'n1', type: 'document', title: 'Doc 1', properties: {} },
        { id: 'n2', type: 'fact', title: 'Fact 1', properties: {} },
      ],
    });
    mockEmbedBatch.mockResolvedValueOnce([[0.1, 0.2], [0.3, 0.4]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // UPDATE calls

    await autoEmbedAuroraNodes(['n1', 'n2']);

    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('respects batch size of 20', async () => {
    // Create 25 nodes
    const nodes = Array.from({ length: 25 }, (_, i) => ({
      id: `n${i}`, type: 'document', title: `Doc ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    mockEmbedBatch
      .mockResolvedValueOnce(Array(20).fill([0.1, 0.2]))
      .mockResolvedValueOnce(Array(5).fill([0.3, 0.4]));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // UPDATE calls

    await autoEmbedAuroraNodes(nodes.map(n => n.id));

    expect(mockEmbedBatch).toHaveBeenCalledTimes(2);
    // First batch: 20 texts
    expect(mockEmbedBatch.mock.calls[0][0]).toHaveLength(20);
    // Second batch: 5 texts
    expect(mockEmbedBatch.mock.calls[1][0]).toHaveLength(5);
  });

  it('returns early for empty array', async () => {
    await autoEmbedAuroraNodes([]);
    expect(mockIsEmbeddingAvailable).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is non-fatal on embedding error', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'n1', type: 'document', title: 'Doc 1', properties: {} }],
    });
    mockEmbedBatch.mockRejectedValueOnce(new Error('Ollama down'));

    // Should not throw
    await expect(autoEmbedAuroraNodes(['n1'])).resolves.toBeUndefined();
  });

  it('stores correct embedding for each node', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', type: 'document', title: 'Doc 1', properties: {} },
        { id: 'n2', type: 'fact', title: 'Fact 1', properties: { key: 'val' } },
      ],
    });
    mockEmbedBatch.mockResolvedValueOnce([[1.0, 2.0], [3.0, 4.0]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // UPDATE

    await autoEmbedAuroraNodes(['n1', 'n2']);

    // Check UPDATE queries were called with correct embeddings
    // First call was SELECT, subsequent are UPDATEs
    const updateCalls = mockQuery.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE')
    );
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][1]).toEqual(['[1,2]', 'n1']);
    expect(updateCalls[1][1]).toEqual(['[3,4]', 'n2']);
  });
});
