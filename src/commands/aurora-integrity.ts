import chalk from 'chalk';
import { checkCrossRefIntegrity } from '../aurora/cross-ref.js';
import { closePool, isDbAvailable } from '../core/db.js';

/**
 * CLI command: aurora:integrity
 * Check cross-ref integrity — find weak Neuron connections.
 */
export async function auroraIntegrityCommand(options: {
  threshold?: string;
  limit?: string;
}): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  const threshold = parseFloat(options.threshold ?? '0.5');
  const limit = parseInt(options.limit ?? '20', 10);

  const issues = await checkCrossRefIntegrity({
    confidenceThreshold: threshold,
    limit,
  });

  console.log(chalk.bold('\nCross-ref Integrity Report'));
  console.log(`${'\u2014'.repeat(50)}\n`);

  if (issues.length === 0) {
    console.log(chalk.green('All cross-refs are healthy!'));
  } else {
    for (const issue of issues) {
      console.log(
        `  ${chalk.red('\u26A0')} Neuron "${issue.neuronTitle}" ` +
        `(confidence ${issue.neuronConfidence.toFixed(2)}) \u2192 ` +
        `Aurora "${issue.auroraTitle}"`,
      );
    }
    console.log(`\n  ${chalk.yellow(`${issues.length} issue(s) found`)}`);
    console.log(`  Threshold: confidence < ${threshold}\n`);
  }

  await closePool();
}
