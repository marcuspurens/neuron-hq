import chalk from 'chalk';
import { ask } from '../aurora/ask.js';
import type { AskOptions } from '../aurora/ask.js';

/**
 * CLI command: aurora:ask <question>
 * Ask a question and get an answer from Aurora knowledge base.
 */
export async function auroraAskCommand(
  question: string,
  cmdOptions: { maxSources?: string; type?: string; scope?: string },
): Promise<void> {
  console.log(chalk.bold('\n🔍 Searching Aurora knowledge base...'));

  const options: AskOptions = {};
  if (cmdOptions.maxSources) {
    options.maxSources = parseInt(cmdOptions.maxSources, 10);
  }
  if (cmdOptions.type) {
    options.type = cmdOptions.type;
  }
  if (cmdOptions.scope) {
    options.scope = cmdOptions.scope;
  }

  try {
    const result = await ask(question, options);

    if (result.noSourcesFound) {
      console.log(chalk.yellow('  No relevant sources found.\n'));
      console.log(chalk.dim(result.answer));
      console.log('');
      return;
    }

    console.log(`  Found ${result.sourcesUsed} relevant sources\n`);

    console.log(chalk.bold('📝 Answer:'));
    console.log(`  ${result.answer.split('\n').join('\n  ')}\n`);

    console.log(chalk.bold('📚 Sources:'));
    for (const [i, citation] of result.citations.entries()) {
      const sim =
        citation.similarity > 0
          ? `, similarity: ${citation.similarity.toFixed(2)}`
          : '';
      console.log(
        `  [${i + 1}] "${citation.title}" (${citation.type}${sim})`,
      );
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
