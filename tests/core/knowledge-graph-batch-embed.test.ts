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

/** Helper: extract UPDATE calls from mockQuery */
function getUpdateCalls(): unknown[][] {
  return mockQuery.mock.calls.filter(
    (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE'),
  );
}

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

    // Verify only 1 UPDATE query (with unnest) for 2 nodes
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toContain('unnest');
  });

  it('returns early for empty array', async () => {
    await autoEmbedNodes([]);
    expect(mockIsEmbeddingAvailable).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('is non-fatal on embedding error', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p-1', type: 'pattern', title: 'Pattern 1', properties: {} }],
    });
    mockEmbedBatch.mockRejectedValueOnce(new Error('Ollama down'));

    // Should not throw
    await expect(autoEmbedNodes(['p-1'])).resolves.toBeUndefined();
  });

  it('batch with 1 node → 1 UPDATE query using unnest', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p-1', type: 'pattern', title: 'Pattern 1', properties: {} }],
    });
    mockEmbedBatch.mockResolvedValueOnce([[0.1, 0.2]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedNodes(['p-1']);

    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toContain('unnest');
    expect(updateCalls[0][1]).toEqual([['p-1'], ['[0.1,0.2]']]);
  });

  it('batch with 20 nodes → 1 UPDATE query', async () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`, type: 'pattern', title: `Pattern ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    mockEmbedBatch.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => [i * 0.1, i * 0.2]),
    );
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedNodes(nodes.map((n) => n.id));

    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
  });

  it('batch with 25 nodes → 2 UPDATE queries (20 + 5)', async () => {
    const nodes = Array.from({ length: 25 }, (_, i) => ({
      id: `n${i}`, type: 'pattern', title: `Pattern ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    mockEmbedBatch
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => [i, i + 1]))
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => [i + 100, i + 101]));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedNodes(nodes.map((n) => n.id));

    expect(mockEmbedBatch).toHaveBeenCalledTimes(2);
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(2);
    // First UPDATE has 20 ids
    expect((updateCalls[0][1] as string[][])[0]).toHaveLength(20);
    // Second UPDATE has 5 ids
    expect((updateCalls[1][1] as string[][])[0]).toHaveLength(5);
  });

  it('embedding error in one batch → other batches continue', async () => {
    const nodes = Array.from({ length: 25 }, (_, i) => ({
      id: `n${i}`, type: 'pattern', title: `Pattern ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    // First batch (20 nodes) fails, second (5 nodes) succeeds
    mockEmbedBatch
      .mockRejectedValueOnce(new Error('Ollama down'))
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => [i, i + 1]));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedNodes(nodes.map((n) => n.id));

    // Only 1 UPDATE query from the successful second batch of 5
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0][1] as string[][])[0]).toHaveLength(5);
  });

  it('UPDATE query uses unnest syntax, not per-node', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', type: 'pattern', title: 'Pattern 1', properties: {} },
        { id: 'e-1', type: 'error', title: 'Error 1', properties: {} },
      ],
    });
    mockEmbedBatch.mockResolvedValueOnce([[1, 2], [3, 4]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedNodes(['p-1', 'e-1']);

    const updateCalls = getUpdateCalls();
    expect(updateCalls.length).toBeGreaterThan(0);
    for (const call of updateCalls) {
      // No per-node WHERE id = $2 pattern
      expect(call[0]).not.toContain('WHERE id = $2');
      // All UPDATE calls use unnest
      expect(call[0]).toContain('unnest');
    }
  });
});
