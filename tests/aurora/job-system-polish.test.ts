import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — module-level, before any imports                           */
/* ------------------------------------------------------------------ */

const mockRunWorker = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
}));

const mockCallMediaTool = vi.fn();
vi.mock('../../src/aurora/media-client.js', () => ({
  callMediaTool: (...args: unknown[]) => mockCallMediaTool(...args),
}));

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAutoEmbedAuroraNodes = vi.fn();
vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  addAuroraNode: vi.fn((_graph: unknown, node: unknown) => {
    const g = _graph as { nodes: unknown[]; edges: unknown[] };
    return { ...g, nodes: [...g.nodes, node] };
  }),
  addAuroraEdge: vi.fn((_graph: unknown, edge: unknown) => {
    const g = _graph as { nodes: unknown[]; edges: unknown[] };
    return { ...g, edges: [...g.edges, edge] };
  }),
  saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  autoEmbedAuroraNodes: (...args: unknown[]) => mockAutoEmbedAuroraNodes(...args),
}));

vi.mock('../../src/aurora/cross-ref.js', () => ({
  findNeuronMatchesForAurora: vi.fn().mockResolvedValue([]),
  createCrossRef: vi.fn(),
}));

vi.mock('../../src/aurora/speaker-identity.js', () => ({
  autoTagSpeakers: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/aurora/voiceprint.js', () => ({
  renameSpeaker: vi.fn(),
}));

vi.mock('../../src/aurora/chunker.js', () => ({
  chunkText: vi.fn().mockReturnValue([
    { index: 0, text: 'chunk1', wordCount: 10, startOffset: 0, endOffset: 50 },
  ]),
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

// Mocks for CLI command tests
const mockGetJobs = vi.fn();
const mockGetJobStats = vi.fn();
vi.mock('../../src/aurora/job-runner.js', () => ({
  getJobs: (...args: unknown[]) => mockGetJobs(...args),
  getJobStats: (...args: unknown[]) => mockGetJobStats(...args),
}));

/* ------------------------------------------------------------------ */
/*  Imports (after all mocks)                                          */
/* ------------------------------------------------------------------ */

import { ingestVideo } from '../../src/aurora/video.js';
import type { ProgressUpdate } from '../../src/aurora/video.js';
import { jobsCommand } from '../../src/commands/jobs.js';
import { jobStatsCommand } from '../../src/commands/job-stats.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyGraph() {
  return { nodes: [], edges: [], lastUpdated: '' };
}

function setupSuccessfulIngest() {
  mockCallMediaTool
    .mockResolvedValueOnce({
      ok: true,
      title: 'Test Video',
      text: '',
      metadata: {
        audioPath: '/tmp/audio.wav',
        videoPath: '/tmp/video.mp4',
        duration: 120,
        extractor: 'youtube',
      },
    })
    .mockResolvedValueOnce({
      ok: true,
      title: '',
      text: 'Hello world this is a test transcript',
      metadata: { language: 'en', segment_count: 5, model_used: 'small' },
    });

  mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
  mockSaveAuroraGraph.mockResolvedValue(undefined);
  mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
}

/* ------------------------------------------------------------------ */
/*  1. onProgress callback tests                                       */
/* ------------------------------------------------------------------ */

describe('onProgress callback', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockCallMediaTool.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAutoEmbedAuroraNodes.mockReset();
  });

  it('onProgress is called with correct steps during ingest', async () => {
    setupSuccessfulIngest();
    const progressSpy = vi.fn();

    await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      onProgress: progressSpy,
    });

    // Collect step names and progress values
    const calls = progressSpy.mock.calls.map(
      (c: [ProgressUpdate]) => ({ step: c[0].step, progress: c[0].progress }),
    );

    // Should have start (0) and end (1.0) for: downloading, transcribing, chunking, embedding, polishing
    const expectedSteps = ['downloading', 'transcribing', 'chunking', 'embedding', 'polishing'];
    for (const step of expectedSteps) {
      const stepCalls = calls.filter((c: { step: string }) => c.step === step);
      expect(stepCalls.length).toBeGreaterThanOrEqual(2);
      expect(stepCalls[0].progress).toBe(0);
      expect(stepCalls[stepCalls.length - 1].progress).toBe(1.0);
    }

    // Total calls: 5 steps x 2 (start + end) = 10
    expect(progressSpy).toHaveBeenCalledTimes(10);
  });

  it('onProgress is optional — ingest works without it', async () => {
    setupSuccessfulIngest();

    // Should not throw when called without onProgress
    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result.transcriptNodeId).toBe('yt-dQw4w9WgXcQ');
    expect(result.title).toBe('Test Video');
    expect(result.chunksCreated).toBeGreaterThanOrEqual(1);
  });

  it('result includes audioPath and videoPath from worker metadata', async () => {
    setupSuccessfulIngest();

    const result = await ingestVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result.audioPath).toBe('/tmp/audio.wav');
    expect(result.videoPath).toBe('/tmp/video.mp4');
  });
});

/* ------------------------------------------------------------------ */
/*  2. CLI jobs command tests                                          */
/* ------------------------------------------------------------------ */

describe('CLI jobs command', () => {
  let consoleOutput: string[];

  beforeEach(() => {
    mockGetJobs.mockReset();
    consoleOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
  });

  it('jobs command prints table of jobs', async () => {
    mockGetJobs.mockResolvedValue([
      {
        id: 'aaaaaaaa-1111-2222-3333-444444444444',
        status: 'done',
        videoTitle: 'My First Video',
        videoDurationSec: 120,
        startedAt: '2025-06-01T10:00:00Z',
        completedAt: '2025-06-01T10:05:00Z',
      },
      {
        id: 'bbbbbbbb-1111-2222-3333-444444444444',
        status: 'running',
        videoTitle: 'Second Video',
        videoDurationSec: 300,
        startedAt: '2025-06-01T11:00:00Z',
        completedAt: null,
      },
    ]);

    await jobsCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('My First Video');
    expect(output).toContain('Second Video');
    expect(output).toContain('done');
    expect(output).toContain('running');
  });

  it('jobs command shows no jobs message when empty', async () => {
    mockGetJobs.mockResolvedValue([]);

    await jobsCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('No jobs found');
  });

  it('jobs command passes status filter', async () => {
    mockGetJobs.mockResolvedValue([]);

    await jobsCommand({ status: 'running' });

    expect(mockGetJobs).toHaveBeenCalledWith({ status: 'running', limit: 10 });
  });
});

/* ------------------------------------------------------------------ */
/*  3. CLI job-stats command tests                                     */
/* ------------------------------------------------------------------ */

describe('CLI job-stats command', () => {
  let consoleOutput: string[];

  beforeEach(() => {
    mockGetJobStats.mockReset();
    consoleOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
  });

  it('job-stats command shows statistics', async () => {
    mockGetJobStats.mockResolvedValue({
      totalVideos: 42,
      totalVideoHours: 15.5,
      totalComputeMs: 3_600_000,
      avgRealtimeFactor: 2.5,
      backendDistribution: { cpu: 30, gpu: 12 },
      successRate: 0.95,
      errorRate: 0.03,
      cancelRate: 0.02,
      avgDurationByStep: { transcribing: 120_000, embedding: 5000 },
      totalTempBytesCleaned: 1_073_741_824, // 1 GB
    });

    await jobStatsCommand();

    const output = consoleOutput.join('\n');
    expect(output).toContain('42');
    expect(output).toContain('95.0%');
    expect(output).toContain('1024.0 MB');
  });

  it('job-stats command handles zero stats', async () => {
    mockGetJobStats.mockResolvedValue({
      totalVideos: 0,
      totalVideoHours: 0,
      totalComputeMs: 0,
      avgRealtimeFactor: 0,
      backendDistribution: {},
      successRate: 0,
      errorRate: 0,
      cancelRate: 0,
      avgDurationByStep: {},
      totalTempBytesCleaned: 0,
    });

    // Should not throw
    await jobStatsCommand();

    const output = consoleOutput.join('\n');
    expect(output).toContain('0');
  });
});
