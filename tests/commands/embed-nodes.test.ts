import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
  isDbAvailable: vi.fn().mockResolvedValue(true),
}));

// Mock embeddings module
const mockEmbed = vi.fn();
const mockEmbedBatch = vi.fn();
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(true),
  getEmbeddingProvider: vi.fn().mockReturnValue({
    embed: (...args: unknown[]) => mockEmbed(...args),
    embedBatch: (...args: unknown[]) => mockEmbedBatch(...args),
    dimension: 1024,
  }),
}));

import { embedNodesCommand } from '../../src/commands/embed-nodes.js';

describe('embed-nodes command', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEmbed.mockReset();
    mockEmbedBatch.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('skips nodes that already have embeddings (idempotent)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await embedNodesCommand();

    expect(console.log).toHaveBeenCalledWith(
      'All nodes already have embeddings. Nothing to do.'
    );
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });

  it('batch-processes nodes in groups of 10', async () => {
    const nodes = Array.from({ length: 15 }, (_, i) => ({
      id: `node-${i}`,
      type: 'pattern',
      title: `Node ${i}`,
      properties: {},
    }));

    mockQuery.mockResolvedValueOnce({ rows: nodes });

    const embedding = Array.from({ length: 1024 }, () => 0.1);
    mockEmbedBatch
      .mockResolvedValueOnce(Array(10).fill(embedding))
      .mockResolvedValueOnce(Array(5).fill(embedding));

    // UPDATE queries for each node
    mockQuery.mockResolvedValue({ rows: [] });

    await embedNodesCommand();

    expect(mockEmbedBatch).toHaveBeenCalledTimes(2);
    // First batch should have 10 texts
    expect(mockEmbedBatch.mock.calls[0][0].length).toBe(10);
    // Second batch should have 5 texts
    expect(mockEmbedBatch.mock.calls[1][0].length).toBe(5);
  });

  it('generates correct text format for embedding', async () => {
    const nodes = [{
      id: 'p-1',
      type: 'pattern',
      title: 'Retry Logic',
      properties: { context: 'API calls' },
    }];

    mockQuery.mockResolvedValueOnce({ rows: nodes });
    const embedding = Array.from({ length: 1024 }, () => 0.1);
    mockEmbedBatch.mockResolvedValueOnce([embedding]);
    mockQuery.mockResolvedValue({ rows: [] });

    await embedNodesCommand();

    expect(mockEmbedBatch).toHaveBeenCalledWith([
      'pattern: Retry Logic. {"context":"API calls"}'
    ]);
  });

  it('reports progress', async () => {
    const nodes = Array.from({ length: 3 }, (_, i) => ({
      id: `node-${i}`,
      type: 'pattern',
      title: `Node ${i}`,
      properties: {},
    }));

    mockQuery.mockResolvedValueOnce({ rows: nodes });
    const embedding = Array.from({ length: 1024 }, () => 0.1);
    mockEmbedBatch.mockResolvedValueOnce(Array(3).fill(embedding));
    mockQuery.mockResolvedValue({ rows: [] });

    await embedNodesCommand();

    expect(console.log).toHaveBeenCalledWith('Embedded 3/3 nodes...');
    expect(console.log).toHaveBeenCalledWith('Done! Embedded 3 nodes.');
  });

  it('exits early if DB not available', async () => {
    const { isDbAvailable } = await import('../../src/core/db.js');
    vi.mocked(isDbAvailable).mockResolvedValueOnce(false);

    await embedNodesCommand();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Database not available')
    );
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });

  it('exits early if embedding provider not available', async () => {
    const { isEmbeddingAvailable } = await import('../../src/core/embeddings.js');
    vi.mocked(isEmbeddingAvailable).mockResolvedValueOnce(false);

    await embedNodesCommand();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Embedding provider not available')
    );
    expect(mockEmbedBatch).not.toHaveBeenCalled();
  });
});
