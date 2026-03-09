import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph } from '../../src/aurora/aurora-schema.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockRunWorker = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
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

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyGraph(): AuroraGraph {
  return { nodes: [], edges: [], lastUpdated: new Date().toISOString() };
}

const extractYouTubeResponse = {
  ok: true,
  title: 'Test Video',
  text: '',
  metadata: {
    videoId: 'dQw4w9WgXcQ',
    duration: 120,
    audioPath: '/tmp/audio.m4a',
    source_type: 'youtube',
  },
};

const transcribeResponse = {
  ok: true,
  title: 'Transcription',
  text: 'Hello world this is a test video with some content about many topics',
  metadata: {
    segments: [
      { start_ms: 0, end_ms: 5000, text: 'Hello world' },
      {
        start_ms: 5000,
        end_ms: 10000,
        text: 'this is a test video with some content about many topics',
      },
    ],
    segment_count: 2,
    language: 'en',
    source_type: 'audio_transcription',
  },
};

const diarizeResponse = {
  ok: true,
  title: 'Diarization',
  text: 'Diarization: 2 speakers detected',
  metadata: {
    speakers: [
      { speaker: 'SPEAKER_1', start_ms: 0, end_ms: 5000 },
      { speaker: 'SPEAKER_2', start_ms: 5000, end_ms: 10000 },
    ],
    speaker_count: 2,
    source_type: 'diarization',
  },
};

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

const { isYouTubeUrl, extractVideoId, ingestYouTube } = await import(
  '../../src/aurora/youtube.js'
);

/* ------------------------------------------------------------------ */
/*  isYouTubeUrl                                                       */
/* ------------------------------------------------------------------ */

describe('isYouTubeUrl', () => {
  it('detects youtube.com/watch?v= URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      true,
    );
  });

  it('detects youtu.be/ URLs', () => {
    expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  it('detects youtube.com/shorts/ URLs', () => {
    expect(
      isYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    ).toBe(true);
  });

  it('detects m.youtube.com/watch URLs', () => {
    expect(
      isYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe(true);
  });

  it('rejects non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isYouTubeUrl('')).toBe(false);
  });

  it('rejects youtube.com without video path', () => {
    expect(isYouTubeUrl('https://youtube.com/channel/xxx')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  extractVideoId                                                     */
/* ------------------------------------------------------------------ */

describe('extractVideoId', () => {
  it('extracts from youtube.com/watch?v=', () => {
    expect(
      extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts from youtu.be/', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('extracts from youtube.com/shorts/', () => {
    expect(
      extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
  });

  it('returns null for non-YouTube URLs', () => {
    expect(extractVideoId('https://example.com')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractVideoId('')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  ingestYouTube                                                      */
/* ------------------------------------------------------------------ */

describe('ingestYouTube', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAutoEmbedAuroraNodes.mockReset();
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
    mockSaveAuroraGraph.mockResolvedValue(undefined);
    mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  });

  it('creates transcript node + chunks', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractYouTubeResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestYouTube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );

    expect(result.transcriptNodeId).toBe('yt-dQw4w9WgXcQ');
    expect(result.chunksCreated).toBeGreaterThanOrEqual(1);
    expect(result.title).toBe('Test Video');
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(1);
    expect(mockAutoEmbedAuroraNodes).toHaveBeenCalledTimes(1);
  });

  it('with diarize creates voice_print nodes', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractYouTubeResponse)
      .mockResolvedValueOnce(transcribeResponse)
      .mockResolvedValueOnce(diarizeResponse);

    const result = await ingestYouTube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { diarize: true },
    );

    expect(result.voicePrintsCreated).toBe(2);
  });

  it('dedup returns early if video already ingested', async () => {
    const graphWithExisting: AuroraGraph = {
      nodes: [
        {
          id: 'yt-dQw4w9WgXcQ',
          type: 'transcript',
          title: 'Existing Video',
          properties: { duration: 120, videoId: 'dQw4w9WgXcQ' },
          confidence: 0.9,
          scope: 'personal',
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ],
      edges: [],
      lastUpdated: new Date().toISOString(),
    };
    mockLoadAuroraGraph.mockResolvedValue(graphWithExisting);

    const result = await ingestYouTube(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );

    expect(mockRunWorker).not.toHaveBeenCalled();
    expect(result.chunksCreated).toBe(0);
    expect(result.voicePrintsCreated).toBe(0);
  });

  it('handles worker error gracefully', async () => {
    mockRunWorker.mockResolvedValueOnce({
      ok: false,
      error: 'download failed',
    });

    await expect(
      ingestYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toThrow('download failed');
  });

  it('throws for non-YouTube URL', async () => {
    await expect(ingestYouTube('https://example.com')).rejects.toThrow();
  });

  it('passes correct actions to workers', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractYouTubeResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'extract_youtube',
      source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'transcribe_audio',
      source: '/tmp/audio.m4a',
    });
  });
});
