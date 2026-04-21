import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph } from '../../src/aurora/aurora-schema.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockRunWorker = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
  isWorkerAvailable: vi.fn().mockResolvedValue(true),
}));

const mockCallMediaTool = vi.fn();
vi.mock('../../src/aurora/media-client.js', () => ({
  callMediaTool: (...args: unknown[]) => mockCallMediaTool(...args),
}));

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAutoEmbedAuroraNodes = vi.fn();
vi.mock('../../src/aurora/aurora-graph.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/aurora/aurora-graph.js')
  >('../../src/aurora/aurora-graph.js');
  return {
    ...actual,
    loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
    saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
    autoEmbedAuroraNodes: (...args: unknown[]) =>
      mockAutoEmbedAuroraNodes(...args),
  };
});

const mockFindNeuronMatchesForAurora = vi.fn();
const mockCreateCrossRef = vi.fn();
vi.mock('../../src/aurora/cross-ref.js', () => ({
  findNeuronMatchesForAurora: (...args: unknown[]) =>
    mockFindNeuronMatchesForAurora(...args),
  createCrossRef: (...args: unknown[]) => mockCreateCrossRef(...args),
}));

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(false),
  getOllamaUrl: vi.fn().mockReturnValue('http://localhost:11434'),
}));

vi.mock('../../src/aurora/transcript-polish.js', () => ({
  polishTranscript: vi.fn().mockResolvedValue({ rawText: '', correctedText: '', batchCount: 0 }),
}));

vi.mock('../../src/aurora/speaker-guesser.js', () => ({
  guessSpeakers: vi.fn().mockResolvedValue({ guesses: [], modelUsed: 'mock' }),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyGraph(): AuroraGraph {
  return { nodes: [], edges: [], lastUpdated: new Date().toISOString() };
}

function generateText(n: number): string {
  return Array.from({ length: n }, (_, i) => `Word${i}`).join(' ');
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
  mockSaveAuroraGraph.mockResolvedValue(undefined);
  mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

const { ingestUrl } = await import('../../src/aurora/intake.js');
const { ingestVideo } = await import('../../src/aurora/video.js');

/* ------------------------------------------------------------------ */
/*  ingestUrl auto cross-ref tests                                     */
/* ------------------------------------------------------------------ */

describe('ingestUrl auto cross-ref', () => {
  it('creates cross-refs for matches with similarity >= 0.7', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Test Article',
      text: generateText(50),
      metadata: { source_type: 'url', word_count: 50 },
    });

    mockFindNeuronMatchesForAurora.mockResolvedValue([
      {
        node: { id: 'pattern-001', title: 'strict-mode', type: 'pattern', confidence: 0.9 },
        source: 'neuron',
        similarity: 0.89,
      },
      {
        node: { id: 'technique-002', title: 'type-guards', type: 'technique', confidence: 0.8 },
        source: 'neuron',
        similarity: 0.73,
      },
      {
        node: { id: 'pattern-003', title: 'low-match', type: 'pattern', confidence: 0.7 },
        source: 'neuron',
        similarity: 0.55,
      },
    ]);
    mockCreateCrossRef.mockResolvedValue({ id: 1 });

    const result = await ingestUrl('https://example.com/article');

    expect(result.crossRefsCreated).toBe(2);
    expect(result.crossRefMatches).toHaveLength(2);
    expect(mockCreateCrossRef).toHaveBeenCalledTimes(2);

    expect(result.crossRefMatches[0]).toEqual({
      neuronNodeId: 'pattern-001',
      neuronTitle: 'strict-mode',
      similarity: 0.89,
      relationship: 'enriches',
    });
    expect(result.crossRefMatches[1]).toEqual({
      neuronNodeId: 'technique-002',
      neuronTitle: 'type-guards',
      similarity: 0.73,
      relationship: 'enriches',
    });
  });

  it('does NOT create cross-refs for matches below 0.7 threshold', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Test',
      text: generateText(50),
      metadata: { source_type: 'url', word_count: 50 },
    });
    mockFindNeuronMatchesForAurora.mockResolvedValue([
      {
        node: { id: 'p-1', title: 'low', type: 'pattern', confidence: 0.5 },
        source: 'neuron',
        similarity: 0.65,
      },
      {
        node: { id: 'p-2', title: 'lower', type: 'pattern', confidence: 0.5 },
        source: 'neuron',
        similarity: 0.50,
      },
    ]);

    const result = await ingestUrl('https://example.com');

    expect(result.crossRefsCreated).toBe(0);
    expect(result.crossRefMatches).toEqual([]);
    expect(mockCreateCrossRef).not.toHaveBeenCalled();
  });

  it('returns crossRefsCreated and crossRefMatches in result', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Test',
      text: generateText(50),
      metadata: { source_type: 'url', word_count: 50 },
    });
    mockFindNeuronMatchesForAurora.mockResolvedValue([
      {
        node: { id: 'pattern-010', title: 'async-patterns', type: 'pattern', confidence: 0.8 },
        source: 'neuron',
        similarity: 0.85,
      },
    ]);
    mockCreateCrossRef.mockResolvedValue({ id: 1 });

    const result = await ingestUrl('https://example.com');

    expect(result).toHaveProperty('crossRefsCreated');
    expect(result).toHaveProperty('crossRefMatches');
    expect(typeof result.crossRefsCreated).toBe('number');
    expect(Array.isArray(result.crossRefMatches)).toBe(true);
  });

  it('returns 0 cross-refs when Neuron KG has no nodes', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Test',
      text: generateText(50),
      metadata: { source_type: 'url', word_count: 50 },
    });
    mockFindNeuronMatchesForAurora.mockResolvedValue([]);

    const result = await ingestUrl('https://example.com');

    expect(result.crossRefsCreated).toBe(0);
    expect(result.crossRefMatches).toEqual([]);
  });

  it('ingest succeeds even if findNeuronMatchesForAurora throws', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Test',
      text: generateText(50),
      metadata: { source_type: 'url', word_count: 50 },
    });
    mockFindNeuronMatchesForAurora.mockRejectedValue(
      new Error('Postgres connection refused'),
    );

    const result = await ingestUrl('https://example.com');

    expect(result.documentNodeId).toMatch(/^doc_/);
    expect(result.crossRefsCreated).toBe(0);
    expect(result.crossRefMatches).toEqual([]);
  });

  it('ingest succeeds even if createCrossRef throws mid-loop', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Test',
      text: generateText(50),
      metadata: { source_type: 'url', word_count: 50 },
    });
    mockFindNeuronMatchesForAurora.mockResolvedValue([
      {
        node: { id: 'p-1', title: 'match1', type: 'pattern', confidence: 0.9 },
        source: 'neuron',
        similarity: 0.85,
      },
    ]);
    mockCreateCrossRef.mockRejectedValue(new Error('DB write failed'));

    const result = await ingestUrl('https://example.com');

    expect(result.documentNodeId).toMatch(/^doc_/);
    expect(result.crossRefsCreated).toBe(0);
    expect(result.crossRefMatches).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  ingestVideo auto cross-ref tests                                 */
/* ------------------------------------------------------------------ */

describe('ingestVideo auto cross-ref', () => {
  it('creates cross-refs for transcript node', async () => {
    mockCallMediaTool
      .mockResolvedValueOnce({
        ok: true,
        title: 'Test Video',
        text: '',
        metadata: { audioPath: '/tmp/audio.wav', duration: 120 },
      })
      .mockResolvedValueOnce({
        ok: true,
        title: 'Test Video',
        text: generateText(100),
        metadata: { language: 'en', segment_count: 5 },
      });

    mockFindNeuronMatchesForAurora.mockResolvedValue([
      {
        node: { id: 'pattern-010', title: 'async-patterns', type: 'pattern', confidence: 0.8 },
        source: 'neuron',
        similarity: 0.85,
      },
    ]);
    mockCreateCrossRef.mockResolvedValue({ id: 1 });

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );

    expect(result.crossRefsCreated).toBe(1);
    expect(result.crossRefMatches).toHaveLength(1);
    expect(result.crossRefMatches[0].neuronNodeId).toBe('pattern-010');
    expect(mockCreateCrossRef).toHaveBeenCalledTimes(1);
  });

  it('returns cross-ref info in result', async () => {
    mockCallMediaTool
      .mockResolvedValueOnce({
        ok: true,
        title: 'Video Title',
        text: '',
        metadata: { audioPath: '/tmp/a.wav', duration: 60 },
      })
      .mockResolvedValueOnce({
        ok: true,
        title: 'Video Title',
        text: generateText(50),
        metadata: { language: 'en', segment_count: 3 },
      });

    mockFindNeuronMatchesForAurora.mockResolvedValue([]);

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=abc12345678',
    );

    expect(result.crossRefsCreated).toBe(0);
    expect(result.crossRefMatches).toEqual([]);
    expect(result.transcriptNodeId).toBe('yt-abc12345678');
    expect(result.title).toBe('Video Title');
  });
});
