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

const extractVideoResponse = {
  ok: true,
  title: 'Test Video',
  text: '',
  metadata: {
    videoId: 'dQw4w9WgXcQ',
    duration: 120,
    audioPath: '/tmp/audio.m4a',
    source_type: 'video',
    extractor: 'youtube',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
};

const extractSvtResponse = {
  ok: true,
  title: 'SVT Nyheter',
  text: '',
  metadata: {
    videoId: null,
    duration: 300,
    audioPath: '/tmp/svt-audio.m4a',
    source_type: 'video',
    extractor: 'svtplay',
    webpage_url: 'https://www.svt.se/nyheter/test-article',
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

const { isYouTubeUrl, isVideoUrl, extractVideoId, videoNodeId, ingestVideo } =
  await import('../../src/aurora/video.js');

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
/*  isVideoUrl                                                         */
/* ------------------------------------------------------------------ */

describe('isVideoUrl', () => {
  it('detects YouTube URLs', () => {
    expect(isVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('detects youtu.be URLs', () => {
    expect(isVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  it('detects Vimeo URLs', () => {
    expect(isVideoUrl('https://vimeo.com/123456789')).toBe(true);
  });

  it('detects SVT URLs', () => {
    expect(isVideoUrl('https://www.svt.se/nyheter/test')).toBe(true);
    expect(isVideoUrl('https://www.svtplay.se/video/12345')).toBe(true);
  });

  it('detects TV4 URLs', () => {
    expect(isVideoUrl('https://www.tv4play.se/program/test')).toBe(true);
    expect(isVideoUrl('https://www.tv4.se/klipp/test')).toBe(true);
  });

  it('detects TikTok URLs', () => {
    expect(isVideoUrl('https://www.tiktok.com/@user/video/123')).toBe(true);
  });

  it('detects Dailymotion URLs', () => {
    expect(isVideoUrl('https://www.dailymotion.com/video/x123')).toBe(true);
  });

  it('detects Twitch URLs', () => {
    expect(isVideoUrl('https://www.twitch.tv/videos/123')).toBe(true);
  });

  it('detects Rumble URLs', () => {
    expect(isVideoUrl('https://rumble.com/v123-test.html')).toBe(true);
  });

  it('rejects unknown domains', () => {
    expect(isVideoUrl('https://example.com')).toBe(false);
    expect(isVideoUrl('https://blog.example.com/article')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isVideoUrl('')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isVideoUrl('not-a-url')).toBe(false);
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
/*  videoNodeId                                                        */
/* ------------------------------------------------------------------ */

describe('videoNodeId', () => {
  it('returns yt-{id} for YouTube URLs', () => {
    expect(videoNodeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'yt-dQw4w9WgXcQ',
    );
  });

  it('returns vid-{hash} for non-YouTube URLs', () => {
    const id = videoNodeId('https://www.svt.se/nyheter/test');
    expect(id).toMatch(/^vid-[a-f0-9]{12}$/);
  });

  it('returns same ID for same URL (deterministic)', () => {
    const url = 'https://vimeo.com/123456789';
    expect(videoNodeId(url)).toBe(videoNodeId(url));
  });

  it('returns different IDs for different URLs', () => {
    const id1 = videoNodeId('https://vimeo.com/111111111');
    const id2 = videoNodeId('https://vimeo.com/222222222');
    expect(id1).not.toBe(id2);
  });
});

/* ------------------------------------------------------------------ */
/*  ingestVideo                                                        */
/* ------------------------------------------------------------------ */

describe('ingestVideo', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAutoEmbedAuroraNodes.mockReset();
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
    mockSaveAuroraGraph.mockResolvedValue(undefined);
    mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  });

  it('creates transcript node + chunks for YouTube URL', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );

    expect(result.transcriptNodeId).toBe('yt-dQw4w9WgXcQ');
    expect(result.chunksCreated).toBeGreaterThanOrEqual(1);
    expect(result.title).toBe('Test Video');
    expect(result.videoId).toBe('dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(1);
    expect(mockAutoEmbedAuroraNodes).toHaveBeenCalledTimes(1);
  });

  it('creates transcript node for non-YouTube URL', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractSvtResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestVideo('https://www.svt.se/nyheter/test-article');

    expect(result.transcriptNodeId).toMatch(/^vid-[a-f0-9]{12}$/);
    expect(result.videoId).toBeNull();
    expect(result.platform).toBe('svtplay');
    expect(result.title).toBe('SVT Nyheter');
    expect(result.chunksCreated).toBeGreaterThanOrEqual(1);
  });

  it('with diarize creates voice_print nodes', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse)
      .mockResolvedValueOnce(diarizeResponse);

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { diarize: true },
    );

    expect(result.voicePrintsCreated).toBe(2);
  });

  it('dedup returns early if video already ingested (YouTube)', async () => {
    const graphWithExisting: AuroraGraph = {
      nodes: [
        {
          id: 'yt-dQw4w9WgXcQ',
          type: 'transcript',
          title: 'Existing Video',
          properties: { duration: 120, videoId: 'dQw4w9WgXcQ', platform: 'youtube' },
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

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );

    expect(mockRunWorker).not.toHaveBeenCalled();
    expect(result.chunksCreated).toBe(0);
    expect(result.voicePrintsCreated).toBe(0);
  });

  it('dedup returns early if non-YouTube video already ingested', async () => {
    const svtUrl = 'https://www.svt.se/nyheter/test-article';
    const nodeId = videoNodeId(svtUrl);
    const graphWithExisting: AuroraGraph = {
      nodes: [
        {
          id: nodeId,
          type: 'transcript',
          title: 'Existing SVT Video',
          properties: { duration: 300, platform: 'svtplay' },
          confidence: 0.9,
          scope: 'personal',
          sourceUrl: svtUrl,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      ],
      edges: [],
      lastUpdated: new Date().toISOString(),
    };
    mockLoadAuroraGraph.mockResolvedValue(graphWithExisting);

    const result = await ingestVideo(svtUrl);

    expect(mockRunWorker).not.toHaveBeenCalled();
    expect(result.chunksCreated).toBe(0);
  });

  it('handles worker error gracefully', async () => {
    mockRunWorker.mockResolvedValueOnce({
      ok: false,
      error: 'download failed',
    });

    await expect(
      ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toThrow('download failed');
  });

  it('sends extract_video action to worker', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(mockRunWorker).toHaveBeenCalledWith(
      {
        action: 'extract_video',
        source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      { timeout: 300_000 },
    );
    expect(mockRunWorker).toHaveBeenCalledWith(
      {
        action: 'transcribe_audio',
        source: '/tmp/audio.m4a',
      },
      { timeout: 600_000 },
    );
  });
});
