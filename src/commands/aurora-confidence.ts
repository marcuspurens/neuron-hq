import chalk from 'chalk';
import { getConfidenceHistory } from '../aurora/bayesian-confidence.js';
import { closePool, isDbAvailable } from '../core/db.js';

/**
 * CLI command: aurora:confidence
 * Shows confidence history for an Aurora node.
 */
export async function auroraConfidenceCommand(
  nodeId: string,
  options: { limit?: string },
): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  const limit = parseInt(options.limit ?? '20', 10);
  const history = await getConfidenceHistory(nodeId, limit);

  console.log(chalk.bold(`\n\uD83C\uDFAF Confidence history for ${nodeId}`));

  if (history.length === 0) {
    console.log(chalk.gray('  No confidence updates recorded.\n'));
    await closePool();
    return;
  }

  // Show current confidence (from most recent entry)
  console.log(`   Current confidence: ${chalk.cyan(history[0].newConfidence.toFixed(4))}\n`);

  // Table header
  console.log(
    chalk.gray(
      '   #  Date        Direction    Source        Weight  Change              Reason',
    ),
  );

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const date = entry.timestamp.slice(0, 10);
    const dir =
      entry.direction === 'supports'
        ? chalk.green('supports   ')
        : chalk.red('contradicts');
    const source = entry.sourceType.padEnd(13);
    const weight = entry.weight.toFixed(2).padStart(5);
    const change = `${entry.oldConfidence.toFixed(2)} \u2192 ${entry.newConfidence.toFixed(2)}`;
    const reason =
      entry.reason.length > 50
        ? entry.reason.slice(0, 47) + '...'
        : entry.reason;

    console.log(
      `   ${String(i + 1).padStart(2)}  ${date}  ${dir}  ${source}  ${weight}  ${change.padEnd(18)}  ${reason}`,
    );
  }

  console.log('');
  await closePool();
}
