import chalk from 'chalk';
import { remember } from '../aurora/memory.js';
import type { RememberOptions } from '../aurora/memory.js';

export async function auroraRememberCommand(
  text: string,
  cmdOptions: { type?: string; scope?: string; tags?: string; source?: string },
): Promise<void> {
  const type = (cmdOptions.type as RememberOptions['type']) ?? 'fact';
  const scope = (cmdOptions.scope as RememberOptions['scope']) ?? 'personal';

  console.log(chalk.bold('\n💾 Remembering...'));
  console.log(`  Type: ${type} | Scope: ${scope}`);

  try {
    const tags = cmdOptions.tags
      ? cmdOptions.tags.split(',').map((t) => t.trim())
      : undefined;

    const result = await remember(text, { type, scope, tags, source: cmdOptions.source });

    if (result.action === 'created') {
      console.log(chalk.green(`\n✅ Created new memory: "${text.slice(0, 50)}..."`));
      console.log(`  ID: ${result.nodeId}`);
    } else if (result.action === 'updated') {
      console.log(chalk.yellow(`\n🔄 Updated existing memory`));
      console.log(`  Similarity: ${result.similarity?.toFixed(2) ?? 'N/A'}`);
      console.log(`  ID: ${result.existingNodeId}`);
    } else {
      console.log(chalk.dim(`\n⏭️  Duplicate — already exists`));
      console.log(`  Similarity: ${result.similarity?.toFixed(2) ?? 'N/A'}`);
      console.log(`  ID: ${result.existingNodeId}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
