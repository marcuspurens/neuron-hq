import chalk from 'chalk';
import { verifySource } from '../aurora/freshness.js';
import { closePool, isDbAvailable } from '../core/db.js';

/**
 * CLI command: aurora:verify
 * Marks an Aurora source node as verified (updates last_verified timestamp).
 */
export async function auroraVerifyCommand(nodeId: string): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  const updated = await verifySource(nodeId);

  if (updated) {
    console.log(chalk.green(`Source ${nodeId} marked as verified (now)`));
  } else {
    console.log(chalk.red(`Node ${nodeId} not found in aurora_nodes`));
  }

  await closePool();
}
