import chalk from 'chalk';
import { renameSpeaker } from '../aurora/voiceprint.js';

/**
 * CLI command: aurora:rename-speaker
 * Renames a speaker in a voice print node.
 */
export async function auroraRenameSpeakerCommand(
  voicePrintId: string,
  newName: string,
): Promise<void> {
  try {
    console.log(chalk.bold('\n🎤 Renaming speaker...'));
    const result = await renameSpeaker(voicePrintId, newName);
    console.log(chalk.green('  ✅ Renamed!'));
    console.log(`    Old: ${result.oldName}`);
    console.log(`    New: ${result.newName}`);
    console.log(`    Node: ${result.voicePrintId}\n`);
  } catch (err) {
    console.log(chalk.red(`  ❌ Error: ${(err as Error).message}\n`));
  }
}
