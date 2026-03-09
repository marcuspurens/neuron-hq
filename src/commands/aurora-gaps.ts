import chalk from 'chalk';
import { getGaps } from '../aurora/knowledge-gaps.js';

/**
 * CLI command: aurora:gaps
 * Show knowledge gaps — questions Aurora could not answer.
 */
export async function auroraGapsCommand(
  cmdOptions: { limit?: string },
): Promise<void> {
  const limit = cmdOptions.limit ? parseInt(cmdOptions.limit, 10) : undefined;

  try {
    const result = await getGaps(limit);

    console.log(chalk.bold('\n🔍 Knowledge Gaps\n'));

    if (result.gaps.length === 0) {
      console.log(chalk.dim('  No knowledge gaps recorded yet.\n'));
      return;
    }

    for (const gap of result.gaps) {
      console.log(
        `  [${gap.frequency}x] "${gap.question}"`,
      );
    }

    console.log(
      `\n  Total: ${result.gaps.length} gaps from ${result.totalUnanswered} unanswered questions\n`,
    );
  } catch (err) {
    console.error(
      chalk.red(
        `\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`,
      ),
    );
  }
}
