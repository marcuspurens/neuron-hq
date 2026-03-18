/**
 * Job worker — child process entry point.
 * Receives job ID via process.argv[2], runs the video ingest pipeline
 * with progress updates to the aurora_jobs table.
 */

import { stat, unlink } from 'fs/promises';
import { getPool, closePool } from '../core/db.js';
import { ingestVideo } from './video.js';
import type { VideoIngestOptions, ProgressUpdate } from './video.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:job-worker');

const jobId = process.argv[2];
if (!jobId) {
  logger.error('Usage: job-worker.ts <job-id>');
  process.exit(1);
}

/**
 * Clean up temporary files and record bytes cleaned in the DB.
 * Silently ignores files that don't exist or are already deleted.
 */
async function cleanupTempFiles(
  paths: string[],
  pool: ReturnType<typeof getPool>,
): Promise<void> {
  let bytesCleaned = 0;
  const tempPaths = paths.filter(Boolean);
  for (const p of tempPaths) {
    try {
      const s = await stat(p);
      await unlink(p);
      bytesCleaned += s.size;
    } catch {  /* intentional: jobs directory may not exist */
      // File may not exist or already deleted
    }
  }
  if (bytesCleaned > 0) {
    const mb = (bytesCleaned / (1024 * 1024)).toFixed(1);
    logger.error('Cleaned up temp files', { mb });
    await pool.query(
      'UPDATE aurora_jobs SET temp_bytes_cleaned = $2 WHERE id = $1',
      [jobId, bytesCleaned],
    ).catch(() => {});
  }
}

async function run(): Promise<void> {
  const pool = getPool();
  let knownTempPaths: string[] = [];

  try {
    // Fetch job from DB
    const { rows } = await pool.query('SELECT * FROM aurora_jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) {
      logger.error('Job not found', { jobId });
      process.exit(1);
    }
    const job = rows[0] as Record<string, unknown>;
    const input = job.input as Record<string, unknown>;
    const url = job.video_url as string;

    // Mark as running
    await pool.query(
      'UPDATE aurora_jobs SET status = $1, started_at = NOW() WHERE id = $2',
      ['running', jobId],
    );

    const options: VideoIngestOptions = {
      diarize: (input.diarize as boolean) ?? true,
      scope: (input.scope as VideoIngestOptions['scope']) ?? 'personal',
      whisperModel: input.whisper_model as string | undefined,
      language: input.language as string | undefined,
    };

    // Track real step timings via onProgress callback
    const realStepTimings: Record<string, number> = {};
    let lastStepName: string | null = null;
    let lastStepStart = Date.now();

    const result = await ingestVideo(url, {
      ...options,
      onProgress: (update: ProgressUpdate) => {
        // Track real step timing
        if (lastStepName && update.step !== lastStepName) {
          realStepTimings[`${lastStepName}_ms`] = Date.now() - lastStepStart;
          lastStepStart = Date.now();
        }
        if (update.step !== lastStepName) {
          lastStepName = update.step;
        }

        // Fire-and-forget DB update
        void pool.query(
          'UPDATE aurora_jobs SET step = $1, progress = $2 WHERE id = $3',
          [update.step, update.progress, jobId],
        ).catch(() => {});
      },
    });

    // Record final step timing
    if (lastStepName) {
      realStepTimings[`${lastStepName}_ms`] = Date.now() - lastStepStart;
    }

    // Collect temp paths for cleanup
    knownTempPaths = [result.audioPath, result.videoPath].filter(Boolean) as string[];

    // Update job as done
    await pool.query(
      `UPDATE aurora_jobs SET
        status = 'done',
        step = NULL,
        progress = 1.0,
        result = $2,
        step_timings = $3,
        backend = $4,
        completed_at = NOW()
      WHERE id = $1`,
      [jobId, JSON.stringify(result), JSON.stringify(realStepTimings), result.modelUsed ?? null],
    );

    logger.error('Job completed successfully', { jobId });

    // Clean up temp files after successful ingest
    await cleanupTempFiles(knownTempPaths, pool);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Job failed', { jobId, message });

    await pool
      .query(
        `UPDATE aurora_jobs SET status = 'error', error = $2, completed_at = NOW() WHERE id = $1`,
        [jobId, message],
      )
      .catch(() => {});

    // Attempt to clean up any known temp files even on error
    await cleanupTempFiles(knownTempPaths, pool);
  } finally {
    // Trigger next job in queue
    try {
      const { rows } = await pool.query(
        `SELECT id FROM aurora_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
      );
      if (rows.length > 0) {
        // Import dynamically to avoid circular deps
        const { processQueue } = await import('./job-runner.js');
        await processQueue();
      }
    } catch (e) {
      logger.error('Failed to process next job in queue', { error: String(e) });
    }

    await closePool();
  }
}

run().catch((err: unknown) => {
  logger.error('Fatal worker error', { error: String(err) });
  process.exit(1);
});
