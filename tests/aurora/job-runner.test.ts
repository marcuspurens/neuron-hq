import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: vi.fn(),
}));

vi.mock('../../src/aurora/video.js', () => ({
  videoNodeId: vi.fn((url: string) => `vid-${url.slice(-8)}`),
}));

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: vi.fn(),
}));

vi.mock('child_process', () => ({
  fork: vi.fn(() => ({
    pid: 12345,
    on: vi.fn(),
  })),
}));

import {
  startVideoIngestJob,
  getJob,
  getJobs,
  updateJobProgress,
  cancelJob,
  processQueue,
  checkCompletedJobs,
  markJobNotified,
  cleanupOldJobs,
  getJobStats,
  estimateTime,
  type AuroraJob,
  type JobStatus,
  type JobStep,
  type JobStats,
  type StartJobResult,
} from '../../src/aurora/job-runner.js';

import { runWorker } from '../../src/aurora/worker-bridge.js';
import { loadAuroraGraph } from '../../src/aurora/aurora-graph.js';

const mockRunWorker = vi.mocked(runWorker);
const mockLoadGraph = vi.mocked(loadAuroraGraph);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** A mock DB row with all aurora_jobs columns. */
function makeDbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'j1',
    type: 'video_ingest',
    status: 'queued',
    step: null,
    progress: 0,
    input: {},
    result: null,
    error: null,
    video_title: null,
    video_duration_sec: null,
    video_url: 'https://youtube.com/watch?v=test1234',
    backend: null,
    step_timings: null,
    temp_bytes_cleaned: 0,
    pid: null,
    notified: false,
    started_at: null,
    completed_at: null,
    created_at: new Date('2025-01-01'),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return empty rows (prevents unhandled promise rejections
  // from fire-and-forget processQueue calls)
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockLoadGraph.mockResolvedValue({ nodes: [], edges: [], lastUpdated: '' });
  mockRunWorker.mockRejectedValue(new Error('not configured'));
});

afterEach(async () => {
  // Let any pending processQueue() settle
  await new Promise((r) => setTimeout(r, 10));
});

/* ------------------------------------------------------------------ */
/*  Type exports                                                       */
/* ------------------------------------------------------------------ */

describe('type exports', () => {
  it('exports JobStatus type', () => {
    const s: JobStatus = 'queued';
    expect(s).toBe('queued');
  });

  it('exports JobStep type', () => {
    const s: JobStep = 'metadata';
    expect(s).toBe('metadata');
  });

  it('exports AuroraJob interface shape', () => {
    const job: AuroraJob = {
      id: '1', type: 'video_ingest', status: 'queued', step: null,
      progress: 0, input: {}, result: null, error: null,
      videoTitle: null, videoDurationSec: null, videoUrl: 'https://x.com/v',
      backend: null, stepTimings: null, tempBytesCleaned: 0, pid: null,
      notified: false, startedAt: null, completedAt: null, createdAt: '2025-01-01',
    };
    expect(job.status).toBe('queued');
  });

  it('exports StartJobResult interface', () => {
    const r: StartJobResult = {
      jobId: '1', status: 'queued', videoTitle: null,
      videoDurationSec: null, estimatedTimeMs: null, queuePosition: null,
    };
    expect(r.status).toBe('queued');
  });

  it('exports JobStats interface', () => {
    const s: JobStats = {
      totalVideos: 0, totalVideoHours: 0, totalComputeMs: 0,
      avgRealtimeFactor: 0, backendDistribution: {}, successRate: 0,
      errorRate: 0, cancelRate: 0, avgDurationByStep: {},
      totalTempBytesCleaned: 0,
    };
    expect(s.totalVideos).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  startVideoIngestJob                                                */
/* ------------------------------------------------------------------ */

describe('startVideoIngestJob', () => {
  it('returns duplicate when same URL is already queued', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'existing-1', status: 'queued', video_title: 'V1', video_duration_sec: 60 }],
      })
      .mockResolvedValue({ rows: [], rowCount: 0 }); // fallback

    const result = await startVideoIngestJob('https://youtube.com/watch?v=abc');
    expect(result.status).toBe('duplicate');
    expect(result.existingJobId).toBe('existing-1');
  });

  it('returns already_ingested when video node exists in graph', async () => {
    const url = 'https://youtube.com/watch?v=abc12345';
    mockLoadGraph.mockResolvedValueOnce({
      nodes: [{
        id: 'vid-abc12345',
        type: 'transcript',
        title: 'Test Video',
        properties: { duration: 120 },
        confidence: 0.9,
        scope: 'personal',
        sourceUrl: url,
        created: '2025-01-01',
        updated: '2025-01-01',
      }],
      edges: [],
      lastUpdated: '',
    });

    const result = await startVideoIngestJob(url);
    expect(result.status).toBe('already_ingested');
    expect(result.videoTitle).toBe('Test Video');
  });

  it('inserts a new job when URL is fresh', async () => {
    // Use sequential mocks for the specific calls in order
    mockQuery
      .mockResolvedValueOnce({ rows: [] })               // dedup check
      .mockResolvedValueOnce({ rows: [{ id: 'new-1' }] }) // INSERT
      .mockResolvedValue({ rows: [], rowCount: 0 });       // everything else

    const result = await startVideoIngestJob('https://youtube.com/watch?v=xyz');
    expect(result.jobId).toBe('new-1');
    expect(result.status).toBe('queued');
  });
});

/* ------------------------------------------------------------------ */
/*  getJob                                                             */
/* ------------------------------------------------------------------ */

describe('getJob', () => {
  it('returns null when no row found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const job = await getJob('nonexistent');
    expect(job).toBeNull();
  });

  it('maps DB row to AuroraJob with camelCase', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeDbRow({
        id: 'j1',
        status: 'done',
        step: 'embedding',
        progress: 100,
        result: { ok: true },
        video_title: 'My Video',
        video_duration_sec: 300,
        backend: 'cpu',
        step_timings: { transcribing: 5000 },
        temp_bytes_cleaned: 1024,
        pid: 42,
        started_at: new Date('2025-01-01'),
        completed_at: new Date('2025-01-02'),
      })],
    });

    const job = await getJob('j1');
    expect(job).not.toBeNull();
    expect(job!.videoTitle).toBe('My Video');
    expect(job!.stepTimings).toEqual({ transcribing: 5000 });
    expect(job!.startedAt).toContain('2025');
    expect(job!.backend).toBe('cpu');
    expect(job!.tempBytesCleaned).toBe(1024);
  });

  it('returns null on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const job = await getJob('j1');
    expect(job).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  getJobs                                                            */
/* ------------------------------------------------------------------ */

describe('getJobs', () => {
  it('returns empty array on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const jobs = await getJobs();
    expect(jobs).toEqual([]);
  });

  it('uses status filter when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getJobs({ status: 'running' });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE status = $1'),
      ['running', 20],
    );
  });

  it('uses default limit of 20', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getJobs();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [20],
    );
  });
});

/* ------------------------------------------------------------------ */
/*  updateJobProgress                                                  */
/* ------------------------------------------------------------------ */

describe('updateJobProgress', () => {
  it('updates step and progress', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateJobProgress('j1', 'transcribing', 50);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('step = $2'),
      ['j1', 'transcribing', 50],
    );
  });

  it('includes extras in update', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await updateJobProgress('j1', 'downloading', 10, { backend: 'gpu' });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('backend'),
      expect.arrayContaining(['gpu']),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  cancelJob                                                          */
/* ------------------------------------------------------------------ */

describe('cancelJob', () => {
  it('returns error when job not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await cancelJob('nope');
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('returns message when already in final state', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'done', pid: null }] });
    const result = await cancelJob('j1');
    expect(result.success).toBe(false);
    expect(result.message).toContain('final state');
  });

  it('cancels a queued job', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'queued', pid: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await cancelJob('j1');
    expect(result.success).toBe(true);
    expect(result.message).toBe('Job cancelled');
  });

  it('cancels a running job with pid', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ status: 'running', pid: 999999 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await cancelJob('j1');
    expect(result.success).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  processQueue                                                       */
/* ------------------------------------------------------------------ */

describe('processQueue', () => {
  it('does nothing if a job is already running', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'running-1' }] })
      .mockResolvedValue({ rows: [], rowCount: 0 });
    await processQueue();
    // Only one query (the running check)
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('does nothing if no queued jobs', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })  // no running
      .mockResolvedValueOnce({ rows: [] })  // no queued
      .mockResolvedValue({ rows: [], rowCount: 0 });
    await processQueue();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  checkCompletedJobs                                                 */
/* ------------------------------------------------------------------ */

describe('checkCompletedJobs', () => {
  it('returns empty on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const jobs = await checkCompletedJobs();
    expect(jobs).toEqual([]);
  });

  it("does not mark jobs as notified (caller uses markJobNotified)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [makeDbRow({ id: "j1", status: "done", notified: false })],
    });

    const jobs = await checkCompletedJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("j1");
    // Should only call SELECT, not UPDATE
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("SELECT");
    expect(sql).not.toContain("UPDATE");
  });

  it('does not update when no completed jobs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const jobs = await checkCompletedJobs();
    expect(jobs).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  markJobNotified                                                    */
/* ------------------------------------------------------------------ */

describe("markJobNotified", () => {
  it("calls UPDATE with notified = true for the given jobId", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await markJobNotified("j42");
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("UPDATE aurora_jobs");
    expect(sql).toContain("notified = true");
    expect(mockQuery.mock.calls[0][1]).toEqual(["j42"]);
  });

  it("does not throw on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    await expect(markJobNotified("j1")).resolves.toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  cleanupOldJobs                                                     */
/* ------------------------------------------------------------------ */

describe('cleanupOldJobs', () => {
  it('returns 0 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const count = await cleanupOldJobs();
    expect(count).toBe(0);
  });

  it('returns deleted count', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 5 });
    const count = await cleanupOldJobs(30);
    expect(count).toBe(5);
  });

  it('uses default of 7 days', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await cleanupOldJobs();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('make_interval'),
      [7],
    );
  });
});

/* ------------------------------------------------------------------ */
/*  estimateTime                                                       */
/* ------------------------------------------------------------------ */

describe('estimateTime', () => {
  it('returns null when duration is null', async () => {
    const est = await estimateTime(null);
    expect(est).toBeNull();
  });

  it('uses historical average when available', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_factor: 500 }] });
    const est = await estimateTime(60);
    expect(est).toBe(30000);
  });

  it('falls back to CPU heuristic when no history', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_factor: null }] });
    const est = await estimateTime(60);
    expect(est).toBe(60000);
  });

  it('falls back to GPU heuristic', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_factor: null }] });
    const est = await estimateTime(60, 'gpu');
    expect(est).toBe(6000);
  });

  it('falls back to heuristic on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db down'));
    const est = await estimateTime(120);
    expect(est).toBe(120000);
  });
});

/* ------------------------------------------------------------------ */
/*  getJobStats                                                        */
/* ------------------------------------------------------------------ */

describe('getJobStats', () => {
  it('returns empty stats on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const stats = await getJobStats();
    expect(stats.totalVideos).toBe(0);
    expect(stats.successRate).toBe(0);
  });

  it('calculates stats from DB', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          total: 10, done: 7, errors: 2, cancelled: 1,
          total_duration_sec: 3600, total_compute_ms: 7200000,
          total_temp_bytes_cleaned: 5242880,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ backend: 'cpu', cnt: 8 }, { backend: 'gpu', cnt: 2 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { step_timings: { transcribing: 4000, chunking: 200 } },
          { step_timings: { transcribing: 6000, chunking: 300 } },
        ],
      });

    const stats = await getJobStats();
    expect(stats.totalVideos).toBe(10);
    expect(stats.successRate).toBe(0.7);
    expect(stats.errorRate).toBe(0.2);
    expect(stats.cancelRate).toBe(0.1);
    expect(stats.backendDistribution).toEqual({ cpu: 8, gpu: 2 });
    expect(stats.avgDurationByStep.transcribing).toBe(5000);
    expect(stats.avgDurationByStep.chunking).toBe(250);
    expect(stats.totalVideoHours).toBe(1);
    expect(stats.avgRealtimeFactor).toBe(2);
    expect(stats.totalTempBytesCleaned).toBe(5242880);
  });
});
