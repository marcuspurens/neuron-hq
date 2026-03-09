import chalk from 'chalk';
import { timeline } from '../aurora/timeline.js';
import type { TimelineOptions } from '../aurora/timeline.js';

/**
 * CLI command: aurora:timeline
 * Show a chronological timeline of Aurora knowledge base entries.
 */
export async function auroraTimelineCommand(
  cmdOptions: { limit?: string; type?: string; scope?: string; since?: string; until?: string },
): Promise<void> {
  const options: TimelineOptions = {};
  if (cmdOptions.limit) {
    options.limit = parseInt(cmdOptions.limit, 10);
  }
  if (cmdOptions.type) {
    options.type = cmdOptions.type;
  }
  if (cmdOptions.scope) {
    options.scope = cmdOptions.scope;
  }
  if (cmdOptions.since) {
    options.since = cmdOptions.since;
  }
  if (cmdOptions.until) {
    options.until = cmdOptions.until;
  }

  try {
    const entries = await timeline(options);

    console.log(chalk.bold(`\n📅 Aurora Timeline (last ${options.limit ?? 20})\n`));

    if (entries.length === 0) {
      console.log(chalk.dim('  No entries found.\n'));
      return;
    }

    for (const entry of entries) {
      const date = entry.createdAt.slice(0, 16).replace('T', ' ');
      const conf = `confidence: ${entry.confidence}`;
      console.log(
        `  ${chalk.dim(date)}  [${entry.type}] "${entry.title}" (${conf})`,
      );
      if (entry.source) {
        console.log(`  ${' '.repeat(18)}Source: ${entry.source}`);
      }
    }
    console.log('');
  } catch (err) {
    console.error(
      chalk.red(
        `\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`,
      ),
    );
  }
}
