import chalk from 'chalk';
import { rejectSpeakerSuggestion } from '../aurora/speaker-identity.js';

export async function auroraRejectSpeakerCommand(voicePrintId: string, identityId: string): Promise<void> {
  try {
    console.log(chalk.bold('\n🚫 Rejecting speaker suggestion...'));
    await rejectSpeakerSuggestion(identityId, voicePrintId);
    console.log(chalk.green(`  ✅ Rejected: ${voicePrintId} is NOT ${identityId}\n`));
  } catch (err) {
    console.log(chalk.red(`  ❌ Error: ${(err as Error).message}\n`));
  }
}
