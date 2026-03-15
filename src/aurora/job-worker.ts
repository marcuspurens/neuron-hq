/**
 * Job worker — child process entry point.
 * Receives job ID via process.argv[2], runs the video ingest pipeline
 * with progress updates to the aurora_jobs table.
 */

import { getPool, closePool } from '../core/db.js';
import { ingestVideo } from './video.js';
import type { VideoIngestOptions } from './video.js';

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: job-worker.ts <job-id>');
  process.exit(1);
}

async function run(): Promise<void> {
  const pool = getPool();

  try {
    // Fetch job from DB
    const { rows } = await pool.query('SELECT * FROM aurora_jobs WHERE id = $1', [jobId]);
    if (rows.length === 0) {
      console.error(`Job ${jobId} not found`);
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

    const stepTimings: Record<string, number> = {};
    let currentStepStart = Date.now();

    // Helper to update progress
    const updateStep = async (
      step: string,
      progress: number,
      extras?: Record<string, unknown>,
    ): Promise<void> => {
      const now = Date.now();
      if (currentStepStart > 0) {
        stepTimings[`${step}_start`] = now - currentStepStart;
      }
      currentStepStart = now;
      const updateParts = ['step = $2', 'progress = $3'];
      const params: unknown[] = [jobId, step, progress];
      let paramIdx = 4;

      if (extras) {
        for (const [key, value] of Object.entries(extras)) {
          updateParts.push(`${key} = $${paramIdx}`);
          params.push(value);
          paramIdx++;
        }
      }

      await pool.query(
        `UPDATE aurora_jobs SET ${updateParts.join(', ')} WHERE id = $1`,
        params,
      );
    };

    // Run the ingest pipeline
    await updateStep('downloading', 0.1);

    const options: VideoIngestOptions = {
      diarize: (input.diarize as boolean) ?? false,
      scope: (input.scope as VideoIngestOptions['scope']) ?? 'personal',
      whisperModel: input.whisper_model as string | undefined,
      language: input.language as string | undefined,
    };

    // Run the full pipeline (this is blocking within this process, which is fine)
    const startTime = Date.now();
    const result = await ingestVideo(url, options);
    const totalMs = Date.now() - startTime;

    // Estimate step timings based on typical distribution
    stepTimings.download_ms = Math.round(totalMs * 0.1);
    stepTimings.transcribe_ms = Math.round(totalMs * 0.6);
    stepTimings.diarize_ms = options.diarize ? Math.round(totalMs * 0.15) : 0;
    stepTimings.chunk_ms = Math.round(totalMs * 0.05);
    stepTimings.embed_ms = Math.round(totalMs * 0.1);

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
      [jobId, JSON.stringify(result), JSON.stringify(stepTimings), result.modelUsed ?? null],
    );

    console.error(`Job ${jobId} completed successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Job ${jobId} failed: ${message}`);

    await pool
      .query(
        `UPDATE aurora_jobs SET status = 'error', error = $2, completed_at = NOW() WHERE id = $1`,
        [jobId, message],
      )
      .catch(() => {});
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
      console.error('Failed to process next job in queue:', e);
    }

    await closePool();
  }
}

run().catch((err: unknown) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
