import chalk from 'chalk';
import { recall } from '../aurora/memory.js';
import type { RecallOptions } from '../aurora/memory.js';

export async function auroraRecallCommand(
  query: string,
  cmdOptions: { type?: string; scope?: string; limit?: string },
): Promise<void> {
  console.log(chalk.bold('\n🔍 Recalling from Aurora memory...'));

  try {
    const options: RecallOptions = {};
    if (cmdOptions.type) options.type = cmdOptions.type as RecallOptions['type'];
    if (cmdOptions.scope) options.scope = cmdOptions.scope as RecallOptions['scope'];
    if (cmdOptions.limit) options.limit = parseInt(cmdOptions.limit, 10);

    const result = await recall(query, options);

    if (result.memories.length === 0) {
      console.log(chalk.yellow('  No memories found.\n'));
      return;
    }

    console.log(`  Found ${result.totalFound} memories\n`);
    console.log(chalk.bold('📝 Memories:'));

    for (const [i, memory] of result.memories.entries()) {
      const tags = memory.tags.length > 0 ? `\n      Tags: ${memory.tags.join(', ')}` : '';
      const sim = memory.similarity !== null ? `, similarity: ${memory.similarity.toFixed(2)}` : '';
      console.log(`  [${i + 1}] "${memory.title}" (${memory.type}, confidence: ${memory.confidence}${sim})${tags}`);
      for (const rel of memory.related) {
        console.log(chalk.dim(`      Related: "${rel.title}" (${rel.edgeType})`));
      }
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
