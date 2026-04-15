import chalk from 'chalk';
import { cascadeDeleteAuroraNode } from '../aurora/cascade-delete.js';
import { closePool, isDbAvailable } from '../core/db.js';

/**
 * CLI command: aurora:delete
 * Cascade-deletes an Aurora node and all its children (chunks, voice prints, cross-refs).
 */
export async function auroraDeleteCommand(nodeId: string): Promise<void> {
  if (!(await isDbAvailable())) {
    console.log(chalk.red('PostgreSQL not available'));
    return;
  }

  try {
    const result = await cascadeDeleteAuroraNode(nodeId);

    if (!result.deleted) {
      const reason =
        result.reason === 'not_found' ? `Node "${nodeId}" not found` : (result.reason ?? 'unknown');
      console.log(chalk.red(`\n  ${reason}\n`));
    } else {
      console.log(chalk.green(`\n  Deleted: ${nodeId}`));
      console.log(`  Chunks removed:             ${result.chunksRemoved}`);
      console.log(`  Voice prints removed:        ${result.voicePrintsRemoved}`);
      console.log(`  Speaker identities removed:  ${result.speakerIdentitiesRemoved}`);
      console.log(`  Cross-refs removed:          ${result.crossRefsRemoved}\n`);
    }
  } catch (err) {
    console.error(
      chalk.red(`\n  Delete failed: ${err instanceof Error ? err.message : String(err)}\n`),
    );
  } finally {
    await closePool();
  }
}
