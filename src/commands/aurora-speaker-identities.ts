import chalk from 'chalk';
import { listSpeakerIdentities } from '../aurora/speaker-identity.js';

export async function auroraSpeakerIdentitiesCommand(): Promise<void> {
  try {
    const identities = await listSpeakerIdentities();
    if (identities.length === 0) {
      console.log(chalk.yellow('\nNo speaker identities found. Use aurora:confirm-speaker to create one.\n'));
      return;
    }
    console.log(chalk.bold('\nKnown Speaker Identities'));
    console.log('════════════════════════\n');
    identities.forEach((identity, i) => {
      const autoTag = identity.confidence >= identity.autoTagThreshold ? '✅' : `❌ (need ${Math.ceil((identity.autoTagThreshold - identity.confidence) / 0.1)} more)`;
      console.log(`  ${i + 1}. ${identity.displayName} (${identity.id})`);
      console.log(`     Confirmations: ${identity.confirmations} · Confidence: ${identity.confidence.toFixed(2)} · Auto-tag: ${autoTag}`);
      console.log(`     Voice prints: ${identity.confirmedVoicePrints.length}\n`);
    });
  } catch (err) {
    console.log(chalk.red(`  ❌ Error: ${(err as Error).message}\n`));
  }
}
