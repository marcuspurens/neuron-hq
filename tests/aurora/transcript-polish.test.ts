import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetConfig } from '../../src/core/config.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockUpdateAuroraNode = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  updateAuroraNode: (...args: unknown[]) => mockUpdateAuroraNode(...args),
}));

vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(true),
  getOllamaUrl: vi.fn().mockReturnValue('http://localhost:11434'),
}));

vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: vi.fn().mockReturnValue({
    client: {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '1. Fixed segment one\n2. Fixed segment two' }],
        }),
      },
    },
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 128000,
  }),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxTokens: 128000,
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OLLAMA_MODEL_POLISH;
  resetConfig();

  mockSaveAuroraGraph.mockResolvedValue(undefined);

  // Default: updateAuroraNode returns the graph with updated node
  mockUpdateAuroraNode.mockImplementation((graph, _id, _updates) => graph);
});

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

const { batchSegments, polishBatch, polishTranscript } = await import(
  '../../src/aurora/transcript-polish.js'
);

/* ------------------------------------------------------------------ */
/*  batchSegments                                                      */
/* ------------------------------------------------------------------ */

describe('batchSegments', () => {
  it('splits segments into batches of the given size', () => {
    const segments = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const batches = batchSegments(segments, 3);
    expect(batches).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
  });

  it('returns one batch when segments fit within batchSize', () => {
    const segments = ['a', 'b', 'c'];
    const batches = batchSegments(segments, 5);
    expect(batches).toEqual([['a', 'b', 'c']]);
  });

  it('returns empty array for empty segments', () => {
    const batches = batchSegments([], 8);
    expect(batches).toEqual([]);
  });

  it('defaults to batchSize 8', () => {
    const segments = Array.from({ length: 20 }, (_, i) => i);
    const batches = batchSegments(segments);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(8);
    expect(batches[1]).toHaveLength(8);
    expect(batches[2]).toHaveLength(4);
  });

  it('handles exact batch size divisions', () => {
    const segments = [1, 2, 3, 4];
    const batches = batchSegments(segments, 2);
    expect(batches).toEqual([[1, 2], [3, 4]]);
  });
});

/* ------------------------------------------------------------------ */
/*  polishBatch — Ollama                                               */
/* ------------------------------------------------------------------ */

describe('polishBatch (Ollama)', () => {
  it('sends batch to Ollama /api/chat with correct format', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '1. Fixed first\n2. Fixed second' },
        done: true,
      }),
    });

    const batch = [{ text: 'frist segment' }, { text: 'secnd segment' }];
    const context = { title: 'Test Video', platform: 'youtube', prevSentence: '', nextSentence: '' };

    const result = await polishBatch(batch, context);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gemma4:26b');
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('Test Video');

    expect(result).toEqual(['Fixed first', 'Fixed second']);
  });

  it('uses custom ollamaModel from options', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '1. Fixed' },
        done: true,
      }),
    });

    await polishBatch(
      [{ text: 'hello' }],
      { title: 'T', platform: 'p', prevSentence: '', nextSentence: '' },
      { ollamaModel: 'llama3' },
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('llama3');
  });

  it('uses OLLAMA_MODEL_POLISH env var', async () => {
    process.env.OLLAMA_MODEL_POLISH = 'mistral';
    resetConfig();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '1. Fixed' },
        done: true,
      }),
    });

    await polishBatch(
      [{ text: 'hello' }],
      { title: 'T', platform: 'p', prevSentence: '', nextSentence: '' },
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('mistral');
  });

  it('throws on Ollama error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    });

    await expect(
      polishBatch(
        [{ text: 'hello' }],
        { title: 'T', platform: 'p', prevSentence: '', nextSentence: '' },
      ),
    ).rejects.toThrow('Ollama polish failed (500): internal error');
  });

  it('falls back to original text when parsing fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: 'Some unparseable response' },
        done: true,
      }),
    });

    const batch = [{ text: 'original one' }, { text: 'original two' }];
    const result = await polishBatch(
      batch,
      { title: 'T', platform: 'p', prevSentence: '', nextSentence: '' },
    );

    // Should fall back to originals since response has no numbered lines
    expect(result).toEqual(['original one', 'original two']);
  });

  it('includes prev/next sentence in context when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '1. Fixed' },
        done: true,
      }),
    });

    await polishBatch(
      [{ text: 'hello' }],
      { title: 'T', platform: 'p', prevSentence: 'Before this', nextSentence: 'After this' },
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain('Previous sentence: Before this');
    expect(body.messages[1].content).toContain('Next sentence: After this');
  });
});

/* ------------------------------------------------------------------ */
/*  polishBatch — Claude                                               */
/* ------------------------------------------------------------------ */

describe('polishBatch (Claude)', () => {
  it('sends batch to Anthropic client', async () => {
    const batch = [{ text: 'frist' }, { text: 'secnd' }];
    const context = { title: 'Video', platform: 'youtube', prevSentence: '', nextSentence: '' };

    const result = await polishBatch(batch, context, { polishModel: 'claude' });

    expect(result).toEqual(['Fixed segment one', 'Fixed segment two']);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  polishTranscript                                                   */
/* ------------------------------------------------------------------ */

describe('polishTranscript', () => {
  const mockGraph = {
    nodes: [
      {
        id: 'node-1',
        type: 'transcript',
        title: 'My Video',
        properties: {
          platform: 'youtube',
          rawSegments: [
            { text: 'Hello wrold' },
            { text: 'This is a tset' },
            { text: 'Goodbye evryone' },
          ],
        },
        confidence: 0.8,
        scope: 'personal',
        sourceUrl: null,
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
      },
    ],
    edges: [],
    lastUpdated: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: '1. Hello world\n2. This is a test\n3. Goodbye everyone',
        },
        done: true,
      }),
    });
  });

  it('loads graph, batches segments, calls polishBatch, saves result', async () => {
    const result = await polishTranscript('node-1');

    expect(mockLoadAuroraGraph).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
    expect(mockUpdateAuroraNode).toHaveBeenCalledWith(
      mockGraph,
      'node-1',
      expect.objectContaining({
        properties: expect.objectContaining({
          rawText: 'Hello wrold This is a tset Goodbye evryone',
          correctedText: expect.any(String),
        }),
      }),
    );
    expect(mockSaveAuroraGraph).toHaveBeenCalled();
    expect(result.rawText).toBe('Hello wrold This is a tset Goodbye evryone');
    expect(result.batchCount).toBe(1);
  });

  it('throws when node is not found', async () => {
    await expect(polishTranscript('nonexistent')).rejects.toThrow('Node not found: nonexistent');
  });

  it('throws when node has no rawSegments', async () => {
    mockLoadAuroraGraph.mockResolvedValue({
      ...mockGraph,
      nodes: [{ ...mockGraph.nodes[0], properties: {} }],
    });

    await expect(polishTranscript('node-1')).rejects.toThrow('has no rawSegments');
  });

  it('throws when Ollama is not available', async () => {
    const { ensureOllama } = await import('../../src/core/ollama.js');
    vi.mocked(ensureOllama).mockResolvedValueOnce(false);

    await expect(polishTranscript('node-1')).rejects.toThrow('Ollama not available');
  });

  it('creates multiple batches for many segments', async () => {
    const manySegments = Array.from({ length: 20 }, (_, i) => ({ text: `seg ${i}` }));
    mockLoadAuroraGraph.mockResolvedValue({
      ...mockGraph,
      nodes: [{ ...mockGraph.nodes[0], properties: { platform: 'youtube', rawSegments: manySegments } }],
    });

    // Mock fetch to return correct number of corrected segments per batch
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      // Batch sizes: 8, 8, 4
      const batchSize = callCount <= 2 ? 8 : 4;
      const content = Array.from({ length: batchSize }, (_, i) => `${i + 1}. corrected ${i}`).join('\n');
      return {
        ok: true,
        json: async () => ({
          message: { role: 'assistant', content },
          done: true,
        }),
      };
    });

    const result = await polishTranscript('node-1');

    expect(result.batchCount).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('uses default platform unknown when not set', async () => {
    mockLoadAuroraGraph.mockResolvedValue({
      ...mockGraph,
      nodes: [{
        ...mockGraph.nodes[0],
        properties: {
          rawSegments: [{ text: 'hello' }],
        },
      }],
    });

    await polishTranscript('node-1');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain('Platform: unknown');
  });
});

/* ------------------------------------------------------------------ */
/*  parseResponse edge cases (tested via polishBatch)                  */
/* ------------------------------------------------------------------ */

describe('response parsing edge cases', () => {
  it('handles colon-separated format (1: text)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '1: Fixed first\n2: Fixed second' },
        done: true,
      }),
    });

    const result = await polishBatch(
      [{ text: 'a' }, { text: 'b' }],
      { title: 'T', platform: 'p', prevSentence: '', nextSentence: '' },
    );
    expect(result).toEqual(['Fixed first', 'Fixed second']);
  });

  it('handles paren-separated format (1) text)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '1) Fixed first\n2) Fixed second' },
        done: true,
      }),
    });

    const result = await polishBatch(
      [{ text: 'a' }, { text: 'b' }],
      { title: 'T', platform: 'p', prevSentence: '', nextSentence: '' },
    );
    expect(result).toEqual(['Fixed first', 'Fixed second']);
  });

  it('handles partial response (some segments missing)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: '1. Fixed first\n' },
        done: true,
      }),
    });

    const result = await polishBatch(
      [{ text: 'original one' }, { text: 'original two' }],
      { title: 'T', platform: 'p', prevSentence: '', nextSentence: '' },
    );
    expect(result).toEqual(['Fixed first', 'original two']);
  });
});
