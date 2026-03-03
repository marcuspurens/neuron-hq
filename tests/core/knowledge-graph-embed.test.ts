import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoEmbedNodes } from '../../src/core/knowledge-graph.js';

// Mock embeddings module
const mockEmbed = vi.fn();
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(true),
  getEmbeddingProvider: vi.fn().mockReturnValue({
    embed: (...args: unknown[]) => mockEmbed(...args),
    dimension: 768,
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
    mockEmbed.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('generates embedding for nodes without one', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'p-1',
        type: 'pattern',
        title: 'Test Pattern',
        properties: { key: 'value' },
      }],
    });

    const fakeEmbedding = Array.from({ length: 768 }, () => 0.1);
    mockEmbed.mockResolvedValueOnce(fakeEmbedding);
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await autoEmbedNodes(['p-1']);

    expect(mockEmbed).toHaveBeenCalledWith(
      'pattern: Test Pattern. {"key":"value"}'
    );
    expect(mockQuery).toHaveBeenCalledTimes(2);
    // Second call should be the UPDATE
    expect(mockQuery.mock.calls[1][0]).toContain('UPDATE kg_nodes SET embedding');
  });

  it('skips when embedding not available', async () => {
    const { isEmbeddingAvailable } = await import('../../src/core/embeddings.js');
    vi.mocked(isEmbeddingAvailable).mockResolvedValueOnce(false);

    await autoEmbedNodes(['p-1']);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it('does nothing for empty nodeIds', async () => {
    await autoEmbedNodes([]);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('gracefully handles embed failure for individual node', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', type: 'pattern', title: 'Node 1', properties: {} },
        { id: 'p-2', type: 'pattern', title: 'Node 2', properties: {} },
      ],
    });

    const fakeEmbedding = Array.from({ length: 768 }, () => 0.1);
    mockEmbed
      .mockRejectedValueOnce(new Error('Ollama timeout'))
      .mockResolvedValueOnce(fakeEmbedding);
    mockQuery.mockResolvedValue({ rows: [] });

    await autoEmbedNodes(['p-1', 'p-2']);

    // Should warn for p-1 but continue with p-2
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to embed node p-1'),
      expect.any(Error)
    );
    // p-2 should still be embedded
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it('gracefully handles total failure', async () => {
    const { isEmbeddingAvailable } = await import('../../src/core/embeddings.js');
    vi.mocked(isEmbeddingAvailable).mockRejectedValueOnce(new Error('DB error'));

    await autoEmbedNodes(['p-1']);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Auto-embed failed'),
      expect.any(Error)
    );
  });
});
