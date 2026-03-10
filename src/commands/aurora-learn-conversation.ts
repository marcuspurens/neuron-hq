import chalk from 'chalk';
import fs from 'fs/promises';
import { learnFromConversation } from '../aurora/conversation.js';
import type { ConversationMessage } from '../aurora/conversation.js';

export async function auroraLearnConversationCommand(
  file: string,
  cmdOptions: { dryRun?: boolean },
): Promise<void> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const messages: ConversationMessage[] = JSON.parse(raw);

    console.log(chalk.bold(`\nLearning from conversation (${messages.length} messages)...\n`));

    const result = await learnFromConversation(messages, {
      dryRun: cmdOptions.dryRun ?? false,
    });

    if (result.itemsExtracted === 0) {
      console.log(chalk.dim('No items extracted from conversation.\n'));
      return;
    }

    console.log(`Extracted ${result.itemsExtracted} items:`);
    for (const item of result.items) {
      const padType = item.type.padEnd(10);
      console.log(`  ${chalk.dim('•')} [${padType}] "${item.text.slice(0, 60)}${item.text.length > 60 ? '...' : ''}"`);
    }

    console.log('');
    if (cmdOptions.dryRun) {
      console.log(chalk.yellow(`Dry run: ${result.itemsNew} new items found, ${result.itemsDuplicate} duplicates (nothing stored)\n`));
    } else {
      console.log(chalk.green(`Result: ${result.itemsNew} new items stored, ${result.itemsDuplicate} duplicate${result.itemsDuplicate !== 1 ? 's' : ''} skipped\n`));
    }
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
