import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph } from '../../src/aurora/aurora-schema.js';
import { PipelineError } from '../../src/aurora/pipeline-errors.js';
import type { ProgressUpdate } from '../../src/aurora/video.js';

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

vi.mock('../../src/aurora/cross-ref.js', () => ({
  findNeuronMatchesForAurora: vi.fn().mockResolvedValue([]),
  createCrossRef: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/aurora/speaker-identity.js', () => ({
  autoTagSpeakers: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/aurora/voiceprint.js', () => ({
  renameSpeaker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../src/aurora/transcript-polish.js', () => ({
  polishTranscript: vi.fn().mockResolvedValue({ rawText: '', correctedText: '', batchCount: 0 }),
}));

vi.mock('../../src/aurora/speaker-guesser.js', () => ({
  guessSpeakers: vi.fn().mockResolvedValue({ guesses: [], modelUsed: 'mock' }),
}));

vi.mock('../../src/aurora/transcript-tldr.js', () => ({
  generateTldr: vi.fn().mockResolvedValue({ tldr: 'Mock summary of the video.', modelUsed: 'mock' }),
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
    channel: 'Test Channel',
    channelId: 'UC1234567890',
    channelHandle: '@testchannel',
    videoDescription: 'This is a test video. It covers many interesting topics about testing.',
    ytTags: ['testing', 'software', 'demo'],
    categories: ['Science & Technology'],
    creators: null,
    chapters: null,
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
    channel: 'SVT Nyheter',
    channelId: '',
    channelHandle: '',
    videoDescription: '',
    ytTags: [],
    categories: [],
    creators: null,
    chapters: null,
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
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(3);
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
    expect(result.title).toBe('Existing Video');
  });

  it('dedup returns early if video already ingested (non-YouTube)', async () => {
    const svtUrl = 'https://www.svt.se/nyheter/test-article';
    const svtNodeId = videoNodeId(svtUrl);

    const graphWithExisting: AuroraGraph = {
      nodes: [
        {
          id: svtNodeId,
          type: 'transcript',
          title: 'SVT Existing',
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

  it('handles worker error gracefully (throws PipelineError)', async () => {
    mockRunWorker.mockResolvedValueOnce({
      ok: false,
      error: 'download failed',
    });

    await expect(
      ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).rejects.toThrow(PipelineError);
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
      { timeout: 600_000 },
    );
    expect(mockRunWorker).toHaveBeenCalledWith(
      {
        action: 'transcribe_audio',
        source: '/tmp/audio.m4a',
      },
      { timeout: 1_800_000 },
    );
  });

  it('passes whisperModel to transcribe worker options', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      whisperModel: 'large',
    });

    expect(mockRunWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transcribe_audio',
        source: '/tmp/audio.m4a',
        options: { whisper_model: 'large' },
      }),
      { timeout: 1_800_000 },
    );
  });

  it('passes language to transcribe worker options', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      language: 'sv',
    });

    expect(mockRunWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transcribe_audio',
        source: '/tmp/audio.m4a',
        options: { language: 'sv' },
      }),
      { timeout: 1_800_000 },
    );
  });

  it('passes both whisperModel and language when both specified', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      whisperModel: 'large',
      language: 'sv',
    });

    expect(mockRunWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transcribe_audio',
        source: '/tmp/audio.m4a',
        options: { whisper_model: 'large', language: 'sv' },
      }),
      { timeout: 1_800_000 },
    );
  });

  it('does not include options key when no whisperModel or language', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const transcribeCall = mockRunWorker.mock.calls.find(
      (call: unknown[]) => (call[0] as Record<string, unknown>).action === 'transcribe_audio',
    );
    expect(transcribeCall).toBeDefined();
    expect(transcribeCall![0]).not.toHaveProperty('options');
  });

  it('includes modelUsed in result when returned by worker', async () => {
    const transcribeResponseWithModel = {
      ...transcribeResponse,
      metadata: {
        ...transcribeResponse.metadata,
        model_used: 'KBLab/kb-whisper-large',
      },
    };
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponseWithModel);

    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.modelUsed).toBe('KBLab/kb-whisper-large');
  });

  it('stores rich metadata on transcript node', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-dQw4w9WgXcQ' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    expect(node).toBeDefined();
    expect(node!.properties.channelName).toBe('Test Channel');
    expect(node!.properties.channelHandle).toBe('@testchannel');
    expect(node!.properties.videoDescription).toBe(
      'This is a test video. It covers many interesting topics about testing.',
    );
    expect(node!.properties.ytTags).toEqual(['testing', 'software', 'demo']);
    expect(node!.properties.categories).toEqual(['Science & Technology']);
    expect(node!.properties.creators).toBeNull();
    expect(node!.properties.chapters).toBeNull();
  });

  it('generates tags from ytTags, categories, and domain', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const lastSaveCall = mockSaveAuroraGraph.mock.calls[mockSaveAuroraGraph.mock.calls.length - 1];
    const savedGraph = lastSaveCall[0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-dQw4w9WgXcQ' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    expect(node).toBeDefined();
    const tags = node!.properties.tags as string[];
    expect(tags).toContain('youtube.com');
    expect(tags).toContain('science & technology');
    expect(tags).toContain('testing');
    expect(tags).toContain('software');
    expect(tags).toContain('demo');
  });

  it('generates LLM summary instead of description first sentence', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const lastSaveCall = mockSaveAuroraGraph.mock.calls[mockSaveAuroraGraph.mock.calls.length - 1];
    const savedGraph = lastSaveCall[0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-dQw4w9WgXcQ' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    expect(node).toBeDefined();
    expect(node!.properties.summary).toBe('Mock summary of the video.');
  });

  it("saves rawSegments on transcript node from transcribeMeta", async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const transcriptNode = savedGraph.nodes.find((n) => n.id === "yt-dQw4w9WgXcQ" && n.type === "transcript" && !n.properties.chunkIndex);
    expect(transcriptNode).toBeDefined();
    expect(transcriptNode!.properties.rawSegments).toEqual([
      { start_ms: 0, end_ms: 5000, text: "Hello world" },
      { start_ms: 5000, end_ms: 10000, text: "this is a test video with some content about many topics" },
    ]);
  });

  it("preserves word timestamps in rawSegments when worker returns them", async () => {
    const transcribeWithWords = {
      ok: true,
      title: 'Transcription',
      text: 'Hello world',
      metadata: {
        segments: [
          {
            start_ms: 0,
            end_ms: 5000,
            text: 'Hello world',
            words: [
              { start_ms: 0, end_ms: 2500, word: ' Hello', probability: 0.98 },
              { start_ms: 2500, end_ms: 5000, word: ' world', probability: 0.95 },
            ],
          },
        ],
        segment_count: 1,
        language: 'en',
        source_type: 'audio_transcription',
      },
    };

    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeWithWords);

    await ingestVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const transcriptNode = savedGraph.nodes.find((n) => n.id === "yt-dQw4w9WgXcQ" && n.type === "transcript" && !n.properties.chunkIndex);
    expect(transcriptNode).toBeDefined();
    const segments = transcriptNode!.properties.rawSegments as Array<{ words?: unknown[] }>;
    expect(segments[0].words).toBeDefined();
    expect(segments[0].words).toHaveLength(2);
    expect(segments[0].words![0]).toEqual(
      expect.objectContaining({ start_ms: 0, end_ms: 2500, word: ' Hello' }),
    );
  });

  it("saves segments (start_ms/end_ms only) on voice_print nodes", async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse)
      .mockResolvedValueOnce(diarizeResponse);

    await ingestVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { diarize: true });

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const vpNodes = savedGraph.nodes.filter((n) => n.type === "voice_print");
    expect(vpNodes).toHaveLength(2);

    const speaker1 = vpNodes.find((n) => n.properties.speakerLabel === "SPEAKER_1");
    expect(speaker1).toBeDefined();
    expect(speaker1!.properties.segments).toEqual([{ start_ms: 0, end_ms: 5000 }]);

    const speaker2 = vpNodes.find((n) => n.properties.speakerLabel === "SPEAKER_2");
    expect(speaker2).toBeDefined();
    expect(speaker2!.properties.segments).toEqual([{ start_ms: 5000, end_ms: 10000 }]);

    // Verify no speaker field leaked into segments
    for (const vp of vpNodes) {
      const segs = vp.properties.segments as Array<Record<string, unknown>>;
      for (const seg of segs) {
        expect(seg).not.toHaveProperty("speaker");
      }
    }
  });

});

/* ------------------------------------------------------------------ */
/*  Subtitle-based transcription                                       */
/* ------------------------------------------------------------------ */

const extractWithSubtitlesResponse = {
  ok: true,
  title: 'Subtitled Video',
  text: '',
  metadata: {
    videoId: 'sub1234567x',
    duration: 180,
    audioPath: '/tmp/audio-sub.m4a',
    source_type: 'video',
    extractor: 'youtube',
    webpage_url: 'https://www.youtube.com/watch?v=sub1234567x',
    subtitles: {
      text: 'Hello everyone welcome to this video about testing',
      segments: [
        { start_ms: 0, end_ms: 4000, text: 'Hello everyone' },
        { start_ms: 4000, end_ms: 10000, text: 'welcome to this video about testing' },
      ],
      segment_count: 2,
      subtitle_format: 'vtt',
    },
    subtitleSource: 'auto',
    channel: 'Sub Channel',
    channelId: '',
    channelHandle: '',
    videoDescription: 'A subtitled video about testing.',
    ytTags: ['subtitles'],
    categories: ['Education'],
    creators: null,
    chapters: null,
  },
};

const extractWithManualSubsResponse = {
  ...extractWithSubtitlesResponse,
  metadata: {
    ...extractWithSubtitlesResponse.metadata,
    subtitleSource: 'manual',
  },
};

describe('Subtitle-based transcription', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAutoEmbedAuroraNodes.mockReset();
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
    mockSaveAuroraGraph.mockResolvedValue(undefined);
    mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  });

  it('skips Whisper when manual subtitles are present', async () => {
    mockRunWorker.mockResolvedValueOnce(extractWithManualSubsResponse);

    const result = await ingestVideo('https://www.youtube.com/watch?v=sub1234567x');

    expect(result.transcriptNodeId).toBe('yt-sub1234567x');
    expect(result.transcriptionSource).toBe('subtitles:manual');
    expect(mockRunWorker).toHaveBeenCalledTimes(1);
    const actions = mockRunWorker.mock.calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).action);
    expect(actions).not.toContain('transcribe_audio');
  });

  it('runs Whisper despite auto-subs and saves reference', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractWithSubtitlesResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestVideo('https://www.youtube.com/watch?v=sub1234567x');

    expect(result.transcriptionSource).toBe('whisper+reference');
    expect(mockRunWorker).toHaveBeenCalledTimes(2);
    const actions = mockRunWorker.mock.calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).action);
    expect(actions).toContain('transcribe_audio');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-sub1234567x' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    expect(node).toBeDefined();
    expect(node!.properties.referenceSubtitles).toBe(
      'Hello everyone welcome to this video about testing',
    );
  });

  it('stores manual subtitle segments as rawSegments on transcript node', async () => {
    mockRunWorker.mockResolvedValueOnce(extractWithManualSubsResponse);

    await ingestVideo('https://www.youtube.com/watch?v=sub1234567x');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-sub1234567x' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    expect(node).toBeDefined();
    expect(node!.properties.rawSegments).toEqual([
      { start_ms: 0, end_ms: 4000, text: 'Hello everyone' },
      { start_ms: 4000, end_ms: 10000, text: 'welcome to this video about testing' },
    ]);
  });

  it('sets provenance method to subtitles:manual for manual subs', async () => {
    mockRunWorker.mockResolvedValueOnce(extractWithManualSubsResponse);

    await ingestVideo('https://www.youtube.com/watch?v=sub1234567x');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-sub1234567x' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    const provenance = node!.properties.provenance as Record<string, unknown>;
    expect(provenance.method).toBe('subtitles:manual');
    expect(provenance.model).toBe('subtitles:manual');
  });

  it('sets confidence to 0.95 for manual subtitle transcripts', async () => {
    mockRunWorker.mockResolvedValueOnce(extractWithManualSubsResponse);

    await ingestVideo('https://www.youtube.com/watch?v=sub1234567x');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-sub1234567x' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    expect(node!.confidence).toBe(0.95);
  });

  it('sets confidence to 0.9 for auto-subs (Whisper used)', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractWithSubtitlesResponse)
      .mockResolvedValueOnce(transcribeResponse);

    await ingestVideo('https://www.youtube.com/watch?v=sub1234567x');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const node = savedGraph.nodes.find(
      (n) => n.id === 'yt-sub1234567x' && n.type === 'transcript' && !n.properties.chunkIndex,
    );
    expect(node!.confidence).toBe(0.9);
  });

  it('falls back to Whisper when no subtitles in extract result', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result.transcriptionSource).toBe('whisper');
    expect(mockRunWorker).toHaveBeenCalledTimes(2);
    const actions = mockRunWorker.mock.calls.map((c: unknown[]) => (c[0] as Record<string, unknown>).action);
    expect(actions).toContain('transcribe_audio');
  });

  it('reports subtitles:manual in pipeline_report for manual subs', async () => {
    mockRunWorker.mockResolvedValueOnce(extractWithManualSubsResponse);

    const result = await ingestVideo('https://www.youtube.com/watch?v=sub1234567x');

    expect(result.pipeline_report!.details.transcribe?.model).toBe('subtitles:manual');
  });
});

/* ------------------------------------------------------------------ */
/*  PipelineError handling                                             */
/* ------------------------------------------------------------------ */

describe('PipelineError handling', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAutoEmbedAuroraNodes.mockReset();
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
    mockSaveAuroraGraph.mockResolvedValue(undefined);
    mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  });

  it('throws PipelineError with Swedish message when extract_video fails', async () => {
    mockRunWorker.mockResolvedValueOnce({ ok: false, error: 'yt-dlp not found' });
    try {
      await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineError);
      expect((err as PipelineError).step).toBe('extract_video');
      expect((err as PipelineError).userMessage).toContain('kunde inte laddas ner');
      expect((err as PipelineError).suggestion).toBeTruthy();
    }
  });

  it('throws PipelineError when transcribe_audio fails', async () => {
    // First call: extract succeeds
    mockRunWorker.mockResolvedValueOnce(extractVideoResponse);
    // Second call: transcribe fails
    mockRunWorker.mockResolvedValueOnce({ ok: false, error: 'Whisper OOM' });
    try {
      await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineError);
      expect((err as PipelineError).step).toBe('transcribe_audio');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Pipeline report                                                    */
/* ------------------------------------------------------------------ */

describe('Pipeline report', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAutoEmbedAuroraNodes.mockReset();
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
    mockSaveAuroraGraph.mockResolvedValue(undefined);
    mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  });

  it('includes pipeline_report in successful result', async () => {
    mockRunWorker.mockResolvedValueOnce(extractVideoResponse);
    mockRunWorker.mockResolvedValueOnce(transcribeResponse);
    mockRunWorker.mockResolvedValueOnce(diarizeResponse);
    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { diarize: true });
    expect(result.pipeline_report).toBeDefined();
    expect(result.pipeline_report!.details.download?.status).toBe('ok');
    expect(result.pipeline_report!.details.transcribe?.status).toBe('ok');
    expect(result.pipeline_report!.steps_completed).toBeGreaterThanOrEqual(5);
  });

  it('marks diarize as skipped when diarize option is false', async () => {
    mockRunWorker.mockResolvedValueOnce(extractVideoResponse);
    mockRunWorker.mockResolvedValueOnce(transcribeResponse);
    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.pipeline_report).toBeDefined();
    expect(result.pipeline_report!.details.diarize?.status).toBe('skipped');
  });

  it('continues pipeline when diarization fails (graceful degradation)', async () => {
    mockRunWorker.mockResolvedValueOnce(extractVideoResponse);
    mockRunWorker.mockResolvedValueOnce(transcribeResponse);
    mockRunWorker.mockResolvedValueOnce({ ok: false, error: 'AudioDecoder ABI mismatch' });
    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { diarize: true });
    expect(result.pipeline_report).toBeDefined();
    expect(result.pipeline_report!.details.diarize?.status).toBe('error');
    expect(result.pipeline_report!.details.diarize?.message).toContain('AudioDecoder');
    expect(result.voicePrintsCreated).toBe(1);
    expect(result.chunksCreated).toBeGreaterThanOrEqual(1);
  });

  it('includes word count in transcribe report details', async () => {
    mockRunWorker.mockResolvedValueOnce(extractVideoResponse);
    mockRunWorker.mockResolvedValueOnce(transcribeResponse);
    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.pipeline_report!.details.transcribe?.words).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Progress metadata                                                  */
/* ------------------------------------------------------------------ */

describe('Progress metadata', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAutoEmbedAuroraNodes.mockReset();
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
    mockSaveAuroraGraph.mockResolvedValue(undefined);
    mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  });

  it('onProgress receives stepNumber and metadata', async () => {
    const progressUpdates: ProgressUpdate[] = [];
    mockRunWorker.mockResolvedValueOnce(extractVideoResponse);
    mockRunWorker.mockResolvedValueOnce(transcribeResponse);
    mockRunWorker.mockResolvedValueOnce(diarizeResponse);
    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      diarize: true,
      onProgress: (u) => progressUpdates.push(u),
    });
    const completedUpdates = progressUpdates.filter(u => u.progress >= 1.0);
    expect(completedUpdates.some(u => u.stepNumber !== undefined)).toBe(true);
    expect(completedUpdates.some(u => u.totalSteps !== undefined)).toBe(true);
  });

  it('onProgress totalSteps is 7', async () => {
    const progressUpdates: ProgressUpdate[] = [];
    mockRunWorker.mockResolvedValueOnce(extractVideoResponse);
    mockRunWorker.mockResolvedValueOnce(transcribeResponse);
    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      onProgress: (u) => progressUpdates.push(u),
    });
    const withTotal = progressUpdates.filter(u => u.totalSteps !== undefined);
    for (const u of withTotal) {
      expect(u.totalSteps).toBe(7);
    }
  });

  it('denoise: true runs denoise_audio worker before transcription', async () => {
    const denoiseResponse = {
      ok: true,
      title: 'audio',
      text: 'Audio denoised successfully',
      metadata: {
        denoised_path: '/tmp/audio_denoised.wav',
        original_path: '/tmp/audio.m4a',
        applied: true,
        fallback_reason: null,
        source_type: 'audio_denoise',
      },
    };

    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(denoiseResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { denoise: true },
    );

    expect(result.denoised).toBe(true);
    expect(mockRunWorker).toHaveBeenCalledTimes(3);
    const denoiseCall = mockRunWorker.mock.calls[1][0];
    expect(denoiseCall.action).toBe('denoise_audio');
    expect(denoiseCall.source).toBe('/tmp/audio.m4a');
    const transcribeCall = mockRunWorker.mock.calls[2][0];
    expect(transcribeCall.action).toBe('transcribe_audio');
    expect(transcribeCall.source).toBe('/tmp/audio_denoised.wav');
  });

  it('denoise: true with fallback passes original audio path to transcribe', async () => {
    const denoiseFallbackResponse = {
      ok: true,
      title: 'audio',
      text: 'Denoise skipped: DeepFilterNet not found in PATH',
      metadata: {
        denoised_path: '/tmp/audio.m4a',
        original_path: '/tmp/audio.m4a',
        applied: false,
        fallback_reason: 'DeepFilterNet not found in PATH',
        source_type: 'audio_denoise',
      },
    };

    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(denoiseFallbackResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { denoise: true },
    );

    expect(result.denoised).toBe(false);
    const transcribeCall = mockRunWorker.mock.calls[2][0];
    expect(transcribeCall.source).toBe('/tmp/audio.m4a');
  });

  it('denoise: false skips denoise step entirely', async () => {
    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(transcribeResponse);

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );

    expect(result.denoised).toBe(false);
    expect(mockRunWorker).toHaveBeenCalledTimes(2);
    const actions = mockRunWorker.mock.calls.map((c: unknown[]) => (c[0] as Record<string, string>).action);
    expect(actions).not.toContain('denoise_audio');
  });

  it('denoise + diarize uses denoised path for both transcribe and diarize', async () => {
    const denoiseResponse = {
      ok: true,
      title: 'audio',
      text: 'Audio denoised successfully',
      metadata: {
        denoised_path: '/tmp/audio_denoised.wav',
        original_path: '/tmp/audio.m4a',
        applied: true,
        fallback_reason: null,
        source_type: 'audio_denoise',
      },
    };

    mockRunWorker
      .mockResolvedValueOnce(extractVideoResponse)
      .mockResolvedValueOnce(denoiseResponse)
      .mockResolvedValueOnce(transcribeResponse)
      .mockResolvedValueOnce(diarizeResponse);

    const result = await ingestVideo(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { denoise: true, diarize: true },
    );

    expect(result.denoised).toBe(true);
    expect(result.voicePrintsCreated).toBe(2);
    const transcribeCall = mockRunWorker.mock.calls[2][0];
    const diarizeCall = mockRunWorker.mock.calls[3][0];
    expect(transcribeCall.source).toBe('/tmp/audio_denoised.wav');
    expect(diarizeCall.source).toBe('/tmp/audio_denoised.wav');
  });
});
