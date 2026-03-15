/**
 * Core job management module for async video ingest.
 * Manages a queue of aurora_jobs in Postgres, forks worker processes,
 * and provides status/stats/cleanup operations.
 */

import { fork, type ChildProcess } from 'child_process';
import { resolve } from 'path';
import { getPool } from '../core/db.js';
import { runWorker } from './worker-bridge.js';
import { videoNodeId } from './video.js';
import { loadAuroraGraph } from './aurora-graph.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export type JobStep = 'metadata' | 'downloading' | 'transcribing' | 'diarizing' | 'chunking' | 'embedding';

export interface AuroraJob {
  id: string;
  type: string;
  status: JobStatus;
  step: JobStep | null;
  progress: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  videoTitle: string | null;
  videoDurationSec: number | null;
  videoUrl: string;
  backend: string | null;
  stepTimings: Record<string, number> | null;
  tempBytesCleaned: number;
  pid: number | null;
  notified: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface JobStats {
  totalVideos: number;
  totalVideoHours: number;
  totalComputeMs: number;
  avgRealtimeFactor: number;
  backendDistribution: Record<string, number>;
  successRate: number;
  errorRate: number;
  cancelRate: number;
  avgDurationByStep: Record<string, number>;
}

export interface StartJobResult {
  jobId: string;
  status: 'queued' | 'running' | 'already_ingested' | 'duplicate';
  videoTitle: string | null;
  videoDurationSec: number | null;
  estimatedTimeMs: number | null;
  queuePosition: number | null;
  existingJobId?: string;
  existingResult?: Record<string, unknown>;
}

export interface StartJobOptions {
  /** Scope for the ingested content. */
  scope?: 'personal' | 'shared' | 'project';
  /** Whether to run speaker diarization. */
  diarize?: boolean;
  /** Language code to force (e.g. 'sv', 'en'). */
  language?: string;
  /** Whisper model to use. */
  whisperModel?: string;
}

/* ------------------------------------------------------------------ */
/*  Helper: map DB row → AuroraJob                                     */
/* ------------------------------------------------------------------ */

/** Convert a Date or string to an ISO string, or null if falsy. */
function toIso(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

/** Convert snake_case DB columns to camelCase TypeScript properties. */
function mapRow(row: Record<string, unknown>): AuroraJob {
  return {
    id: row.id as string,
    type: row.type as string,
    status: row.status as JobStatus,
    step: (row.step as JobStep) ?? null,
    progress: row.progress as number,
    input: (row.input as Record<string, unknown>) ?? {},
    result: (row.result as Record<string, unknown>) ?? null,
    error: (row.error as string) ?? null,
    videoTitle: (row.video_title as string) ?? null,
    videoDurationSec: (row.video_duration_sec as number) ?? null,
    videoUrl: row.video_url as string,
    backend: (row.backend as string) ?? null,
    stepTimings: (row.step_timings as Record<string, number>) ?? null,
    tempBytesCleaned: (row.temp_bytes_cleaned as number) ?? 0,
    pid: (row.pid as number) ?? null,
    notified: (row.notified as boolean) ?? false,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  startVideoIngestJob                                                */
/* ------------------------------------------------------------------ */

/**
 * Queue a new video ingest job. Performs dedup checks and quick metadata fetch.
 */
export async function startVideoIngestJob(
  url: string,
  options?: StartJobOptions,
): Promise<StartJobResult> {
  const pool = getPool();

  // 1. Dedup: check if same URL already queued or running
  try {
    const { rows: existing } = await pool.query(
      `SELECT id, status, result, video_title, video_duration_sec
       FROM aurora_jobs
       WHERE video_url = $1 AND status IN ('queued', 'running')
       LIMIT 1`,
      [url],
    );
    if (existing.length > 0) {
      const row = existing[0] as Record<string, unknown>;
      return {
        jobId: row.id as string,
        status: 'duplicate',
        videoTitle: (row.video_title as string) ?? null,
        videoDurationSec: (row.video_duration_sec as number) ?? null,
        estimatedTimeMs: null,
        queuePosition: null,
        existingJobId: row.id as string,
      };
    }
  } catch (err) {
    console.error('Failed dedup check:', err);
  }

  // 2. Check if already ingested in Aurora graph
  try {
    const nodeId = videoNodeId(url);
    const graph = await loadAuroraGraph();
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (node) {
      // Find the most recent done job for this URL
      const { rows: doneJobs } = await pool.query(
        `SELECT id, result FROM aurora_jobs
         WHERE video_url = $1 AND status = 'done'
         ORDER BY completed_at DESC LIMIT 1`,
        [url],
      );
      return {
        jobId: doneJobs.length > 0 ? (doneJobs[0] as Record<string, unknown>).id as string : nodeId,
        status: 'already_ingested',
        videoTitle: node.title,
        videoDurationSec: (node.properties.duration as number) ?? null,
        estimatedTimeMs: null,
        queuePosition: null,
        existingResult: doneJobs.length > 0
          ? (doneJobs[0] as Record<string, unknown>).result as Record<string, unknown>
          : undefined,
      };
    }
  } catch (err) {
    console.error('Failed graph check:', err);
  }

  // 3. Quick metadata fetch (non-blocking, best-effort)
  let videoTitle: string | null = null;
  let videoDurationSec: number | null = null;
  try {
    const metaResult = await runWorker(
      { action: 'extract_video_metadata', source: url },
      { timeout: 10_000 },
    );
    if (metaResult.ok) {
      videoTitle = metaResult.title ?? null;
      const meta = metaResult.metadata as Record<string, unknown>;
      videoDurationSec = (meta.duration as number) ?? null;
    }
  } catch {
    // Metadata fetch is best-effort; continue without it
  }

  // 4. Insert job row
  const { rows: inserted } = await pool.query(
    `INSERT INTO aurora_jobs (type, status, video_url, video_title, video_duration_sec, input)
     VALUES ('video_ingest', 'queued', $1, $2, $3, $4)
     RETURNING id`,
    [url, videoTitle, videoDurationSec, JSON.stringify(options ?? {})],
  );
  const jobId = (inserted[0] as Record<string, unknown>).id as string;

  // 5. Trigger queue processing
  void processQueue();

  // 6. Calculate queue position
  let queuePosition: number | null = null;
  try {
    const { rows: posRows } = await pool.query(
      `SELECT COUNT(*)::int AS pos FROM aurora_jobs
       WHERE status = 'queued' AND created_at <= (
         SELECT created_at FROM aurora_jobs WHERE id = $1
       )`,
      [jobId],
    );
    queuePosition = (posRows[0] as Record<string, unknown>).pos as number;
  } catch {
    // Non-critical
  }

  // 7. Estimate time
  const estimatedTimeMs = await estimateTime(videoDurationSec);

  return {
    jobId,
    status: 'queued',
    videoTitle,
    videoDurationSec,
    estimatedTimeMs,
    queuePosition,
  };
}

/* ------------------------------------------------------------------ */
/*  getJob                                                             */
/* ------------------------------------------------------------------ */

/** Fetch a single job by ID. */
export async function getJob(jobId: string): Promise<AuroraJob | null> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT * FROM aurora_jobs WHERE id = $1',
      [jobId],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0] as Record<string, unknown>);
  } catch (err) {
    console.error('Failed to get job:', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  getJobs                                                            */
/* ------------------------------------------------------------------ */

/** Fetch jobs with optional status filter. */
export async function getJobs(
  options?: { status?: string; limit?: number },
): Promise<AuroraJob[]> {
  try {
    const pool = getPool();
    const limit = options?.limit ?? 20;
    if (options?.status) {
      const { rows } = await pool.query(
        'SELECT * FROM aurora_jobs WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
        [options.status, limit],
      );
      return (rows as Record<string, unknown>[]).map(mapRow);
    }
    const { rows } = await pool.query(
      'SELECT * FROM aurora_jobs ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return (rows as Record<string, unknown>[]).map(mapRow);
  } catch (err) {
    console.error('Failed to get jobs:', err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  updateJobProgress                                                  */
/* ------------------------------------------------------------------ */

/** Update the current step and progress of a running job. */
export async function updateJobProgress(
  jobId: string,
  step: JobStep,
  progress: number,
  extras?: Partial<Pick<AuroraJob, 'backend' | 'videoTitle' | 'videoDurationSec'>>,
): Promise<void> {
  try {
    const pool = getPool();
    const setClauses = ['step = $2', 'progress = $3'];
    const params: unknown[] = [jobId, step, progress];
    let idx = 4;

    if (extras?.backend !== undefined) {
      setClauses.push(`backend = $${idx}`);
      params.push(extras.backend);
      idx++;
    }
    if (extras?.videoTitle !== undefined) {
      setClauses.push(`video_title = $${idx}`);
      params.push(extras.videoTitle);
      idx++;
    }
    if (extras?.videoDurationSec !== undefined) {
      setClauses.push(`video_duration_sec = $${idx}`);
      params.push(extras.videoDurationSec);
      idx++;
    }

    await pool.query(
      `UPDATE aurora_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
      params,
    );
  } catch (err) {
    console.error('Failed to update job progress:', err);
  }
}

/* ------------------------------------------------------------------ */
/*  cancelJob                                                          */
/* ------------------------------------------------------------------ */

/** Cancel a job. Kills the worker process if running. */
export async function cancelJob(
  jobId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT status, pid FROM aurora_jobs WHERE id = $1',
      [jobId],
    );
    if (rows.length === 0) {
      return { success: false, message: 'Job not found' };
    }

    const row = rows[0] as Record<string, unknown>;
    const status = row.status as string;
    const pid = row.pid as number | null;

    if (status === 'done' || status === 'error' || status === 'cancelled') {
      return { success: false, message: `Job already in final state: ${status}` };
    }

    if (status === 'running' && pid) {
      try {
        process.kill(pid);
      } catch {
        // Process may have already exited
      }
    }

    await pool.query(
      `UPDATE aurora_jobs SET status = 'cancelled', completed_at = NOW() WHERE id = $1`,
      [jobId],
    );
    return { success: true, message: 'Job cancelled' };
  } catch (err) {
    console.error('Failed to cancel job:', err);
    return { success: false, message: `Cancel failed: ${String(err)}` };
  }
}

/* ------------------------------------------------------------------ */
/*  processQueue                                                       */
/* ------------------------------------------------------------------ */

/** Process the next queued job if no job is currently running. */
export async function processQueue(): Promise<void> {
  try {
    const pool = getPool();

    // Check if any job is already running
    const { rows: running } = await pool.query(
      `SELECT id FROM aurora_jobs WHERE status = 'running' LIMIT 1`,
    );
    if (running.length > 0) return;

    // Find oldest queued job
    const { rows: queued } = await pool.query(
      `SELECT id FROM aurora_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
    );
    if (queued.length === 0) return;

    const jobId = (queued[0] as Record<string, unknown>).id as string;
    const workerPath = resolve(import.meta.dirname ?? '.', 'job-worker.js');

    // Fork the worker process
    const child: ChildProcess = fork(workerPath, [jobId], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const pid = child.pid ?? null;

    // Update job status to running
    await pool.query(
      `UPDATE aurora_jobs SET status = 'running', started_at = NOW(), pid = $2 WHERE id = $1`,
      [jobId, pid],
    );

    // When the worker exits, process the next job in queue
    child.on('exit', () => {
      void processQueue();
    });

    child.on('error', (err) => {
      console.error(`Job worker error for ${jobId}:`, err);
      void processQueue();
    });
  } catch (err) {
    console.error('Failed to process queue:', err);
  }
}

/* ------------------------------------------------------------------ */
/*  checkCompletedJobs                                                 */
/* ------------------------------------------------------------------ */

/** Find recently completed jobs that have not been notified yet. */
export async function checkCompletedJobs(): Promise<AuroraJob[]> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM aurora_jobs
       WHERE status = 'done' AND notified = false
         AND completed_at > NOW() - INTERVAL '5 minutes'`,
    );
    const jobs = (rows as Record<string, unknown>[]).map(mapRow);

    if (jobs.length > 0) {
      const ids = jobs.map((j) => j.id);
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `UPDATE aurora_jobs SET notified = true WHERE id IN (${placeholders})`,
        ids,
      );
    }

    return jobs;
  } catch (err) {
    console.error('Failed to check completed jobs:', err);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  cleanupOldJobs                                                     */
/* ------------------------------------------------------------------ */

/** Delete old jobs in terminal states. Returns count of deleted rows. */
export async function cleanupOldJobs(days: number = 7): Promise<number> {
  try {
    const pool = getPool();
    const { rowCount } = await pool.query(
      `DELETE FROM aurora_jobs
       WHERE created_at < NOW() - make_interval(days => $1)
         AND status IN ('done', 'error', 'cancelled')`,
      [days],
    );
    return rowCount ?? 0;
  } catch (err) {
    console.error('Failed to cleanup old jobs:', err);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  getJobStats                                                        */
/* ------------------------------------------------------------------ */

/** Aggregate statistics across all jobs. */
export async function getJobStats(): Promise<JobStats> {
  const empty: JobStats = {
    totalVideos: 0,
    totalVideoHours: 0,
    totalComputeMs: 0,
    avgRealtimeFactor: 0,
    backendDistribution: {},
    successRate: 0,
    errorRate: 0,
    cancelRate: 0,
    avgDurationByStep: {},
  };

  try {
    const pool = getPool();

    // Basic counts
    const { rows: countRows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
        COALESCE(SUM(video_duration_sec) FILTER (WHERE status = 'done'), 0) AS total_duration_sec,
        COALESCE(SUM(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)
          FILTER (WHERE status = 'done' AND started_at IS NOT NULL AND completed_at IS NOT NULL), 0
        ) AS total_compute_ms
      FROM aurora_jobs
    `);
    const counts = countRows[0] as Record<string, unknown>;
    const total = counts.total as number;
    const done = counts.done as number;
    const errors = counts.errors as number;
    const cancelled = counts.cancelled as number;
    const totalDurationSec = Number(counts.total_duration_sec);
    const totalComputeMs = Number(counts.total_compute_ms);

    // Backend distribution
    const { rows: backendRows } = await pool.query(`
      SELECT backend, COUNT(*)::int AS cnt
      FROM aurora_jobs
      WHERE backend IS NOT NULL
      GROUP BY backend
    `);
    const backendDistribution: Record<string, number> = {};
    for (const row of backendRows as Record<string, unknown>[]) {
      backendDistribution[row.backend as string] = row.cnt as number;
    }

    // Average step timings
    const { rows: timingRows } = await pool.query(`
      SELECT step_timings FROM aurora_jobs
      WHERE step_timings IS NOT NULL AND status = 'done'
    `);
    const stepTotals: Record<string, number> = {};
    const stepCounts: Record<string, number> = {};
    for (const row of timingRows as Record<string, unknown>[]) {
      const timings = row.step_timings as Record<string, number> | null;
      if (!timings) continue;
      for (const [step, ms] of Object.entries(timings)) {
        stepTotals[step] = (stepTotals[step] ?? 0) + ms;
        stepCounts[step] = (stepCounts[step] ?? 0) + 1;
      }
    }
    const avgDurationByStep: Record<string, number> = {};
    for (const step of Object.keys(stepTotals)) {
      avgDurationByStep[step] = Math.round(stepTotals[step] / stepCounts[step]);
    }

    // Realtime factor: total_compute_ms / (total_duration_sec * 1000)
    const avgRealtimeFactor = totalDurationSec > 0
      ? totalComputeMs / (totalDurationSec * 1000)
      : 0;

    return {
      totalVideos: total,
      totalVideoHours: totalDurationSec / 3600,
      totalComputeMs,
      avgRealtimeFactor: Math.round(avgRealtimeFactor * 100) / 100,
      backendDistribution,
      successRate: total > 0 ? done / total : 0,
      errorRate: total > 0 ? errors / total : 0,
      cancelRate: total > 0 ? cancelled / total : 0,
      avgDurationByStep,
    };
  } catch (err) {
    console.error('Failed to get job stats:', err);
    return empty;
  }
}

/* ------------------------------------------------------------------ */
/*  estimateTime                                                       */
/* ------------------------------------------------------------------ */

/**
 * Estimate total processing time for a video based on historical data.
 * Falls back to heuristic: CPU ≈ 1x realtime, GPU ≈ 0.1x realtime.
 */
export async function estimateTime(
  videoDurationSec: number | null,
  backend?: string,
): Promise<number | null> {
  if (videoDurationSec == null) return null;

  try {
    const pool = getPool();
    const { rows } = await pool.query(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 / NULLIF(video_duration_sec, 0)) AS avg_factor
      FROM aurora_jobs
      WHERE status = 'done'
        AND started_at IS NOT NULL
        AND completed_at IS NOT NULL
        AND video_duration_sec > 0
    `);

    const avgFactor = (rows[0] as Record<string, unknown>).avg_factor as number | null;
    if (avgFactor != null) {
      return Math.round(avgFactor * videoDurationSec);
    }
  } catch {
    // Fall through to heuristic
  }

  // Fallback heuristic
  const factor = backend === 'gpu' ? 0.1 : 1.0;
  return Math.round(videoDurationSec * factor * 1000);
}
