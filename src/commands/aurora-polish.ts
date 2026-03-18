import chalk from 'chalk';
import { polishTranscript } from '../aurora/transcript-polish.js';
import type { PolishOptions } from '../aurora/transcript-polish.js';

export async function auroraPolishCommand(
  nodeId: string,
  cmdOptions: {
    polishModel?: string;
    ollamaModel?: string;
  },
): Promise<void> {
  console.log(chalk.bold('\n✨ Polishing transcript...'));
  console.log(`  Node: ${nodeId}\n`);

  const options: PolishOptions = {};
  if (cmdOptions.polishModel === 'claude') {
    options.polishModel = 'claude';
  }
  if (cmdOptions.ollamaModel) {
    options.ollamaModel = cmdOptions.ollamaModel;
  }

  try {
    const result = await polishTranscript(nodeId, options);
    console.log(chalk.green('  ✅ Transcript polished!'));
    console.log(`    Batches processed: ${result.batchCount}`);
    console.log(`    Raw text length: ${result.rawText.length} chars`);
    console.log(`    Corrected text length: ${result.correctedText.length} chars`);
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
