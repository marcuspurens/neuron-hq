import chalk from 'chalk';
import { mergeSpeakers } from '../aurora/voiceprint.js';

/**
 * CLI command: aurora:merge-speakers
 * Merges two voice prints (source → target).
 */
export async function auroraMergeSpeakersCommand(
  sourceId: string,
  targetId: string,
): Promise<void> {
  try {
    console.log(chalk.bold('\n🔗 Merging speakers...'));
    const result = await mergeSpeakers(sourceId, targetId);
    console.log(chalk.green('  ✅ Merged!'));
    console.log(`    Source removed: ${sourceId}`);
    console.log(`    Target kept: ${result.targetName}`);
    console.log(`    Segments transferred: ${result.sourceSegments}`);
    console.log(`    Total segments now: ${result.totalSegments}\n`);
  } catch (err) {
    console.log(chalk.red(`  ❌ Error: ${(err as Error).message}\n`));
  }
}
