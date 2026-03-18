import chalk from 'chalk';
import { guessSpeakers } from '../aurora/speaker-guesser.js';
import type { SpeakerGuessOptions } from '../aurora/speaker-guesser.js';

export async function auroraIdentifySpeakersCommand(
  nodeId: string,
  cmdOptions: {
    model?: string;
    ollamaModel?: string;
  },
): Promise<void> {
  console.log(chalk.bold('\n🗣️  Identifying speakers...'));
  console.log(`  Node: ${nodeId}\n`);

  const options: SpeakerGuessOptions = {};
  if (cmdOptions.model === 'claude') {
    options.model = 'claude';
  }
  if (cmdOptions.ollamaModel) {
    options.ollamaModel = cmdOptions.ollamaModel;
  }

  try {
    const result = await guessSpeakers(nodeId, options);
    console.log(chalk.green(`  ✅ Speaker identification complete! (model: ${result.modelUsed})`));

    for (const guess of result.guesses) {
      const nameStr = guess.name || '(unknown)';
      console.log(`\n    ${guess.speakerLabel}:`);
      console.log(`      Name: ${nameStr}`);
      console.log(`      Confidence: ${guess.confidence}%`);
      console.log(`      Role: ${guess.role}`);
      console.log(`      Reason: ${guess.reason}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
