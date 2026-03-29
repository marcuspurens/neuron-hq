import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OllamaEmbedding,
  isEmbeddingAvailable,
  getEmbeddingProvider,
  resetEmbeddingProvider,
} from '../../src/core/embeddings.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock db module
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(false),
}));

// Mock ollama module — skip auto-start in tests
vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(true),
  getOllamaUrl: vi.fn().mockReturnValue('http://localhost:11434'),
}));

describe('OllamaEmbedding', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetEmbeddingProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('embed() calls Ollama API and returns embedding', async () => {
    const fakeEmbedding = Array.from({ length: 1024 }, (_, i) => i * 0.001);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [fakeEmbedding] }),
    });

    const provider = new OllamaEmbedding();
    const result = await provider.embed('test text');

    expect(result).toEqual(fakeEmbedding);
    expect(result.length).toBe(1024);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/embed',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'snowflake-arctic-embed', input: 'test text' }),
      })
    );
  });

  it('embedBatch() returns multiple embeddings', async () => {
    const fakeEmbeddings = [
      Array.from({ length: 1024 }, () => 0.5),
      Array.from({ length: 1024 }, () => 0.3),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: fakeEmbeddings }),
    });

    const provider = new OllamaEmbedding();
    const result = await provider.embedBatch(['text1', 'text2']);

    expect(result.length).toBe(2);
    expect(result[0].length).toBe(1024);
    expect(result[1].length).toBe(1024);
  });

  it('embed() throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const provider = new OllamaEmbedding();
    await expect(provider.embed('test')).rejects.toThrow('Ollama embed failed: 500');
  });

  it('embedBatch() falls back to individual calls on batch failure', async () => {
    const fakeEmbedding = Array.from({ length: 1024 }, () => 0);
    // First call (batch) fails, then two individual calls succeed
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [fakeEmbedding] }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [fakeEmbedding] }),
    });

    const provider = new OllamaEmbedding();
    const result = await provider.embedBatch(['a', 'b']);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1024);
  });

  it('uses custom baseUrl and model', async () => {
    const fakeEmbedding = Array.from({ length: 1024 }, () => 0);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [fakeEmbedding] }),
    });

    const provider = new OllamaEmbedding('http://custom:1234', 'custom-model');
    await provider.embed('test');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://custom:1234/api/embed',
      expect.objectContaining({
        body: JSON.stringify({ model: 'custom-model', input: 'test' }),
      })
    );
  });

  it('dimension is 1024', () => {
    const provider = new OllamaEmbedding();
    expect(provider.dimension).toBe(1024);
  });
});

describe('isEmbeddingAvailable', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetEmbeddingProvider();
  });

  it('returns false when DB is not available', async () => {
    const result = await isEmbeddingAvailable();
    expect(result).toBe(false);
  });

  it('returns false when Ollama fails', async () => {
    const { isDbAvailable } = await import('../../src/core/db.js');
    vi.mocked(isDbAvailable).mockResolvedValueOnce(true);
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await isEmbeddingAvailable();
    expect(result).toBe(false);
  });
});

describe('getEmbeddingProvider', () => {
  beforeEach(() => {
    resetEmbeddingProvider();
  });

  it('returns singleton', () => {
    const p1 = getEmbeddingProvider();
    const p2 = getEmbeddingProvider();
    expect(p1).toBe(p2);
  });

  it('returns new instance after reset', () => {
    const p1 = getEmbeddingProvider();
    resetEmbeddingProvider();
    const p2 = getEmbeddingProvider();
    expect(p1).not.toBe(p2);
  });
});
