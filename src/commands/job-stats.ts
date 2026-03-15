import chalk from 'chalk';
import { getJobStats } from '../aurora/job-runner.js';

/**
 * CLI command: job-stats
 * Show aggregate video ingest job statistics.
 */
export async function jobStatsCommand(): Promise<void> {
  const stats = await getJobStats();

  console.log(chalk.bold('\n📊 Job Statistics:\n'));
  console.log(`  Total videos processed: ${stats.totalVideos}`);
  console.log(`  Total video hours:      ${stats.totalVideoHours.toFixed(1)}h`);
  console.log(`  Total compute time:     ${(stats.totalComputeMs / 1000 / 60).toFixed(1)} min`);
  console.log(`  Avg realtime factor:    ${stats.avgRealtimeFactor}x`);
  console.log(`  Success rate:           ${(stats.successRate * 100).toFixed(1)}%`);
  console.log(`  Error rate:             ${(stats.errorRate * 100).toFixed(1)}%`);
  console.log(`  Cancel rate:            ${(stats.cancelRate * 100).toFixed(1)}%`);
  console.log(`  Temp files cleaned:     ${(stats.totalTempBytesCleaned / (1024 * 1024)).toFixed(1)} MB`);

  if (Object.keys(stats.backendDistribution).length > 0) {
    console.log(chalk.bold('\n  Backend distribution:'));
    for (const [backend, count] of Object.entries(stats.backendDistribution)) {
      console.log(`    ${backend}: ${count}`);
    }
  }

  if (Object.keys(stats.avgDurationByStep).length > 0) {
    console.log(chalk.bold('\n  Avg duration by step:'));
    for (const [step, ms] of Object.entries(stats.avgDurationByStep)) {
      console.log(`    ${step}: ${(ms / 1000).toFixed(1)}s`);
    }
  }

  console.log('');
}
