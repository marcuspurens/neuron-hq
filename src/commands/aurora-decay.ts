import chalk from 'chalk';
import { getPool, closePool, isDbAvailable } from '../core/db.js';

/**
 * CLI command: aurora:decay
 * Applies confidence decay to Aurora nodes not updated recently.
 */
export async function auroraDecayCommand(options: {
  dryRun?: boolean;
  days?: string;
  factor?: string;
}): Promise<void> {
  const inactiveDays = parseInt(options.days ?? '20', 10);
  const decayFactor = parseFloat(options.factor ?? '0.9');
  const dryRun = options.dryRun ?? false;

  console.log(chalk.bold('\nAurora Confidence Decay'));
  console.log('─────────────────────────\n');

  if (!(await isDbAvailable())) {
    console.log(chalk.yellow('  Database not available.\n'));
    await closePool();
    return;
  }

  const pool = getPool();

  try {
    if (dryRun) {
      // Dry run: just count affected nodes
      const { rows } = await pool.query(
        `SELECT count(*)::int as count FROM aurora_nodes WHERE updated < NOW() - make_interval(days => $1) AND confidence > 0.01`,
        [inactiveDays],
      );
      const count = rows[0]?.count ?? 0;

      console.log(chalk.yellow('  DRY RUN — no data changed\n'));
      console.log(`  Nodes affected: ${count}`);
      console.log(`  Decay factor: ${decayFactor}`);
      console.log(`  Inactive threshold: ${inactiveDays} days\n`);
    } else {
      // Real run: call the decay_confidence function
      const { rows } = await pool.query(
        'SELECT * FROM decay_confidence($1, $2, $3)',
        ['aurora_nodes', inactiveDays, decayFactor],
      );
      const result = rows[0];

      console.log(`  Nodes affected: ${result?.updated_count ?? 0}`);
      console.log(`  Avg confidence before: ${(result?.avg_before ?? 0).toFixed(2)}`);
      console.log(`  Avg confidence after:  ${(result?.avg_after ?? 0).toFixed(2)}`);
      console.log(`  Decay factor: ${decayFactor}`);
      console.log(`  Inactive threshold: ${inactiveDays} days\n`);
    }
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  } finally {
    await closePool();
  }
}
