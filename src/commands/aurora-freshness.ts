import chalk from 'chalk';
import { getFreshnessReport } from '../aurora/freshness.js';
import { closePool, isDbAvailable } from '../core/db.js';

/**
 * CLI command: aurora:freshness
 * Shows freshness report for Aurora source nodes.
 */
export async function auroraFreshnessCommand(options: {
  stale?: boolean;
  limit?: string;
}): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  const limit = parseInt(options.limit ?? '20', 10);
  const report = await getFreshnessReport({
    onlyStale: options.stale ?? false,
    limit,
  });

  console.log(chalk.bold(`\nAurora Source Freshness Report`));
  console.log(`${'\u2014'.repeat(50)}\n`);

  if (report.length === 0) {
    console.log(chalk.green('All sources are fresh!'));
  } else {
    for (const item of report) {
      const statusIcon = {
        fresh: chalk.green('FRESH'),
        aging: chalk.yellow('AGING'),
        stale: chalk.red('STALE'),
        unverified: chalk.gray('UNVERIFIED'),
      }[item.status];

      const days = item.daysSinceVerified != null
        ? `${item.daysSinceVerified}d ago`
        : 'never';

      console.log(
        `  ${statusIcon} [${item.freshnessScore.toFixed(2)}] ` +
        `${item.title} (${item.type}, verified: ${days})`,
      );
    }
  }

  console.log(`\n  Total: ${report.length} sources\n`);
  await closePool();
}
