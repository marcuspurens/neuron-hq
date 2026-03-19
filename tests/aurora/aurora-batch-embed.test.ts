import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockQuery = vi.fn();
const mockIsEmbeddingAvailable = vi.fn();
const mockEmbedBatch = vi.fn();
const mockEmbed = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();

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

vi.mock('../../src/core/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
  }),
}));

import { autoEmbedAuroraNodes } from '../../src/aurora/aurora-graph.js';

/** Helper: extract UPDATE calls from mockQuery */
function getUpdateCalls(): unknown[][] {
  return mockQuery.mock.calls.filter(
    (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE'),
  );
}

describe('autoEmbedAuroraNodes batch embedding', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuery.mockReset();
    mockIsEmbeddingAvailable.mockReset();
    mockEmbedBatch.mockReset();
    mockEmbed.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
    mockIsEmbeddingAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls embedBatch instead of embed', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', type: 'document', title: 'Doc 1', properties: {} },
        { id: 'n2', type: 'fact', title: 'Fact 1', properties: {} },
      ],
    });
    mockEmbedBatch.mockResolvedValueOnce([[0.1, 0.2], [0.3, 0.4]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedAuroraNodes(['n1', 'n2']);

    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    expect(mockEmbed).not.toHaveBeenCalled();

    // Verify only 1 UPDATE query (with unnest) for 2 nodes
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toContain('unnest');
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
    mockEmbedBatch.mockRejectedValue(new Error('Ollama down'));

    // Start the function (it will be waiting on sleep internally)
    const promise = autoEmbedAuroraNodes(['n1']);

    // Advance past all retry delays (2000 + 4000 = 6000ms)
    await vi.advanceTimersByTimeAsync(10000);

    // Should not throw
    await expect(promise).resolves.toBeUndefined();
  });

  it('stores correct embedding for each node', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', type: 'document', title: 'Doc 1', properties: {} },
        { id: 'n2', type: 'fact', title: 'Fact 1', properties: { key: 'val' } },
      ],
    });
    mockEmbedBatch.mockResolvedValueOnce([[1, 2], [3, 4]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedAuroraNodes(['n1', 'n2']);

    // Expect 1 batch UPDATE with unnest, not 2 per-node UPDATEs
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toContain('unnest');
    expect(updateCalls[0][1]).toEqual([['n1', 'n2'], ['[1,2]', '[3,4]']]);
  });

  it('batch with 1 node → 1 UPDATE query using unnest', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'n1', type: 'document', title: 'Doc 1', properties: {} }],
    });
    mockEmbedBatch.mockResolvedValueOnce([[0.1, 0.2]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedAuroraNodes(['n1']);

    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toContain('unnest');
    expect(updateCalls[0][1]).toEqual([['n1'], ['[0.1,0.2]']]);
  });

  it('batch with 20 nodes → 1 UPDATE query', async () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`, type: 'document', title: `Doc ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    mockEmbedBatch.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => [i * 0.1, i * 0.2]),
    );
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedAuroraNodes(nodes.map((n) => n.id));

    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
  });

  it('batch with 25 nodes → 2 UPDATE queries (20 + 5)', async () => {
    const nodes = Array.from({ length: 25 }, (_, i) => ({
      id: `n${i}`, type: 'document', title: `Doc ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    mockEmbedBatch
      .mockResolvedValueOnce(Array.from({ length: 20 }, (_, i) => [i, i + 1]))
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => [i + 100, i + 101]));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedAuroraNodes(nodes.map((n) => n.id));

    expect(mockEmbedBatch).toHaveBeenCalledTimes(2);
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(2);
    // First UPDATE has 20 ids
    expect((updateCalls[0][1] as string[][])[0]).toHaveLength(20);
    // Second UPDATE has 5 ids
    expect((updateCalls[1][1] as string[][])[0]).toHaveLength(5);
  });

  it('embedding error in one batch → other batches continue (after retries exhausted)', async () => {
    const nodes = Array.from({ length: 25 }, (_, i) => ({
      id: `n${i}`, type: 'document', title: `Doc ${i}`, properties: {},
    }));
    mockQuery.mockResolvedValueOnce({ rows: nodes });
    // First batch (20 nodes) always fails (all 3 attempts), second (5 nodes) succeeds
    mockEmbedBatch
      .mockRejectedValueOnce(new Error('Ollama down'))   // batch 1 attempt 1
      .mockRejectedValueOnce(new Error('Ollama down'))   // batch 1 attempt 2
      .mockRejectedValueOnce(new Error('Ollama down'))   // batch 1 attempt 3
      .mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => [i, i + 1])); // batch 2 attempt 1
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const promise = autoEmbedAuroraNodes(nodes.map((n) => n.id));

    // Advance past retry delays for batch 1 (2000ms + 4000ms)
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    // Only 1 UPDATE query from the successful second batch of 5
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0][1] as string[][])[0]).toHaveLength(5);
  });

  it('UPDATE query uses unnest syntax, not per-node', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', type: 'document', title: 'Doc 1', properties: {} },
        { id: 'n2', type: 'fact', title: 'Fact 1', properties: {} },
      ],
    });
    mockEmbedBatch.mockResolvedValueOnce([[1, 2], [3, 4]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedAuroraNodes(['n1', 'n2']);

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

describe('autoEmbedAuroraNodes retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockQuery.mockReset();
    mockIsEmbeddingAvailable.mockReset();
    mockEmbedBatch.mockReset();
    mockEmbed.mockReset();
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
    mockIsEmbeddingAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds on first try without retries', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'n1', type: 'document', title: 'Doc 1', properties: {} }],
    });
    mockEmbedBatch.mockResolvedValueOnce([[0.1, 0.2]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await autoEmbedAuroraNodes(['n1']);

    // embedBatch called exactly once (no retries)
    expect(mockEmbedBatch).toHaveBeenCalledTimes(1);
    // No warn/error logs
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
    // Embedding saved
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
  });

  it('retries once on failure then succeeds', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'n1', type: 'document', title: 'Doc 1', properties: {} }],
    });
    // First attempt fails, second succeeds
    mockEmbedBatch
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce([[0.5, 0.6]]);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const promise = autoEmbedAuroraNodes(['n1']);

    // Advance past the first retry delay (2000ms)
    await vi.advanceTimersByTimeAsync(3000);

    await promise;

    // embedBatch called twice (1 fail + 1 success)
    expect(mockEmbedBatch).toHaveBeenCalledTimes(2);
    // One warning log for the failed attempt
    expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn.mock.calls[0][0]).toContain('attempt 1/3');
    expect(mockLoggerWarn.mock.calls[0][0]).toContain('retrying in 2000ms');
    // No error log (it eventually succeeded)
    expect(mockLoggerError).not.toHaveBeenCalled();
    // Embedding saved
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][1]).toEqual([['n1'], ['[0.5,0.6]']]);
  });

  it('exhausts all retries and logs node IDs on final failure', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', type: 'document', title: 'Doc 1', properties: {} },
        { id: 'n2', type: 'fact', title: 'Fact 2', properties: {} },
      ],
    });
    // All 3 attempts fail
    mockEmbedBatch
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockRejectedValueOnce(new Error('Fail 3'));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const promise = autoEmbedAuroraNodes(['n1', 'n2']);

    // Advance past all retry delays (2000ms + 4000ms = 6000ms)
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    // embedBatch called 3 times (1 initial + 2 retries)
    expect(mockEmbedBatch).toHaveBeenCalledTimes(3);
    // 2 warning logs for the first 2 failed attempts
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn.mock.calls[0][0]).toContain('attempt 1/3');
    expect(mockLoggerWarn.mock.calls[1][0]).toContain('attempt 2/3');
    // 1 error log for final failure with node IDs
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError.mock.calls[0][0]).toContain('failed after 3 attempts');
    expect(mockLoggerError.mock.calls[0][1]).toEqual(
      expect.objectContaining({ nodeIds: ['n1', 'n2'] }),
    );
    // No UPDATE queries (all attempts failed)
    const updateCalls = getUpdateCalls();
    expect(updateCalls).toHaveLength(0);
  });

  it('uses exponential backoff delays', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'n1', type: 'document', title: 'Doc 1', properties: {} }],
    });
    mockEmbedBatch
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockRejectedValueOnce(new Error('Fail 3'));
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    const promise = autoEmbedAuroraNodes(['n1']);

    // Advance past all retry delays
    await vi.advanceTimersByTimeAsync(10000);

    await promise;

    // Verify backoff: first retry at 2000ms (2000 * 2^0), second at 4000ms (2000 * 2^1)
    expect(mockLoggerWarn.mock.calls[0][0]).toContain('retrying in 2000ms');
    expect(mockLoggerWarn.mock.calls[1][0]).toContain('retrying in 4000ms');
  });
});
