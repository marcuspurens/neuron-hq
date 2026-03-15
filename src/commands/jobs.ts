import chalk from 'chalk';
import { getJobs } from '../aurora/job-runner.js';

/**
 * CLI command: jobs
 * List recent video ingest jobs with status, title, duration, and timestamps.
 */
export async function jobsCommand(options: { status?: string; limit?: string }): Promise<void> {
  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  const jobs = await getJobs({ status: options.status, limit });

  if (jobs.length === 0) {
    console.log(chalk.yellow('No jobs found.'));
    return;
  }

  console.log(chalk.bold(`\nRecent Jobs (${jobs.length}):\n`));
  console.log(
    chalk.dim(
      'ID'.padEnd(10) +
      'Status'.padEnd(12) +
      'Title'.padEnd(40) +
      'Duration'.padEnd(12) +
      'Started'.padEnd(22) +
      'Completed'.padEnd(22),
    ),
  );
  console.log(chalk.dim('-'.repeat(118)));

  for (const job of jobs) {
    const idShort = job.id.slice(0, 8);
    const statusColor = job.status === 'done' ? chalk.green
      : job.status === 'running' ? chalk.cyan
      : job.status === 'error' ? chalk.red
      : job.status === 'cancelled' ? chalk.yellow
      : chalk.white;
    const title = (job.videoTitle ?? 'Untitled').slice(0, 38);
    const duration = job.videoDurationSec
      ? `${Math.round(job.videoDurationSec / 60)} min`
      : '-';
    const started = job.startedAt
      ? new Date(job.startedAt).toLocaleString('sv-SE', {
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
          day: 'numeric',
        })
      : '-';
    const completed = job.completedAt
      ? new Date(job.completedAt).toLocaleString('sv-SE', {
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
          day: 'numeric',
        })
      : '-';

    console.log(
      idShort.padEnd(10) +
      statusColor(job.status.padEnd(12)) +
      title.padEnd(40) +
      duration.padEnd(12) +
      started.padEnd(22) +
      completed.padEnd(22),
    );
  }
  console.log('');
}
