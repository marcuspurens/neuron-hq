import chalk from 'chalk';
import path from 'path';
import { getBeliefs, getBeliefHistory, getSummary, backfillAllRuns } from '../core/run-statistics.js';

interface StatisticsOptions {
  filter?: string;
  history?: string;
  summary?: boolean;
  backfill?: boolean;
}

/**
 * CLI command: neuron:statistics
 * Shows Bayesian beliefs about run performance dimensions.
 */
export async function neuronStatisticsCommand(options: StatisticsOptions): Promise<void> {
  // Handle --backfill
  if (options.backfill) {
    const { BASE_DIR } = await import('../cli.js');
    const runsDir = path.join(BASE_DIR, 'runs');
    console.log(chalk.cyan('Backfilling run statistics...'));
    const result = await backfillAllRuns(runsDir);
    console.log(chalk.green(`✅ Backfilled ${result.processed} runs, ${result.dimensions} dimensions`));
    return;
  }

  // Handle --history <dimension>
  if (options.history) {
    const history = await getBeliefHistory(options.history);
    if (history.length === 0) {
      console.log(chalk.yellow(`No history for dimension: ${options.history}`));
      return;
    }
    console.log(chalk.cyan(`\n📊 Confidence History: ${options.history}\n`));
    console.log(
      chalk.gray('Timestamp'.padEnd(25)) +
      'Old'.padEnd(8) + '→ New'.padEnd(8) +
      'Success'.padEnd(10) + 'Weight'.padEnd(8) + 'Evidence',
    );
    console.log(chalk.gray('─'.repeat(80)));
    for (const entry of history) {
      const ts = new Date(entry.timestamp).toISOString().slice(0, 19);
      const successStr = entry.success ? chalk.green('✓') : chalk.red('✗');
      console.log(
        chalk.gray(ts.padEnd(25)) +
        entry.old_confidence.toFixed(4).padEnd(8) +
        ('→ ' + entry.new_confidence.toFixed(4)).padEnd(8) +
        successStr.padEnd(10) +
        entry.weight.toFixed(2).padEnd(8) +
        entry.evidence.slice(0, 40),
      );
    }
    return;
  }

  // Handle --summary
  if (options.summary) {
    const summary = await getSummary();
    console.log(chalk.cyan('\n📊 Neuron Run Statistics — Summary\n'));

    const printList = (title: string, beliefs: typeof summary.strongest): void => {
      console.log(chalk.bold(title));
      if (beliefs.length === 0) {
        console.log(chalk.gray('  (no data)'));
      }
      for (const b of beliefs) {
        console.log(`  ${b.dimension.padEnd(30)} ${b.confidence.toFixed(4)}  (${b.successes}/${b.total_runs} runs)`);
      }
      console.log();
    };
    printList('🏆 Strongest:', summary.strongest);
    printList('⚠️  Weakest:', summary.weakest);
    printList('📈 Trending Up:', summary.trending_up);
    printList('📉 Trending Down:', summary.trending_down);
    return;
  }

  // Default: show all beliefs (optionally filtered)
  const beliefs = await getBeliefs(options.filter ? { prefix: options.filter } : undefined);
  if (beliefs.length === 0) {
    console.log(chalk.yellow('No run beliefs found. Run --backfill to populate from existing runs.'));
    return;
  }

  console.log(chalk.cyan('\n📊 Neuron Run Statistics\n'));
  console.log(
    chalk.bold('Dimension'.padEnd(35)) +
    chalk.bold('Confidence'.padEnd(12)) +
    chalk.bold('Runs'.padEnd(8)) +
    chalk.bold('Successes'.padEnd(12)),
  );
  console.log(chalk.gray('─'.repeat(65)));
  for (const b of beliefs) {
    const confColor = b.confidence >= 0.7 ? chalk.green : b.confidence >= 0.4 ? chalk.yellow : chalk.red;
    console.log(
      b.dimension.padEnd(35) +
      confColor(b.confidence.toFixed(4).padEnd(12)) +
      String(b.total_runs).padEnd(8) +
      String(b.successes).padEnd(12),
    );
  }
}
