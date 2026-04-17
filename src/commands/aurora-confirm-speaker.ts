import chalk from 'chalk';
import { createSpeakerIdentity, confirmSpeaker, listSpeakerIdentities } from '../aurora/speaker-identity.js';

export async function auroraConfirmSpeakerCommand(voicePrintId: string, identityName: string): Promise<void> {
  try {
    console.log(chalk.bold('\n🎤 Confirming speaker...'));
    // Check if identity exists
    const identities = await listSpeakerIdentities();
    const existing = identities.find(i => i.displayName.toLowerCase() === identityName.toLowerCase());
    if (existing) {
      const result = await confirmSpeaker(existing.id, voicePrintId);
      const prev = result.identity.confirmations > 1 ? result.identity.confirmations - 1 : 1;
      const prevConf = Math.min(0.95, 0.5 + (prev - 1) * 0.1);
      console.log(chalk.green(`  ✅ Confirmed: ${voicePrintId} is "${result.identity.displayName}"`));
      console.log(`     Identity: ${result.identity.id}`);
      console.log(`     Confirmations: ${prev} → ${result.identity.confirmations}`);
      console.log(`     Confidence: ${prevConf.toFixed(2)} → ${result.newConfidence.toFixed(2)}`);
      console.log(`     Auto-tag: ${result.newConfidence >= result.identity.autoTagThreshold ? '✅' : `not yet (need ≥ ${result.identity.autoTagThreshold.toFixed(2)})`}\n`);
    } else {
      const identity = await createSpeakerIdentity(identityName, voicePrintId);
      console.log(chalk.green(`  ✅ Confirmed: ${voicePrintId} is "${identity.displayName}"`));
      console.log(`     Identity: ${identity.id} (new)`);
      console.log(`     Confirmations: 1`);
      console.log(`     Confidence: ${identity.confidence.toFixed(2)}`);
      console.log(`     Auto-tag: not yet (need ≥ ${identity.autoTagThreshold.toFixed(2)})\n`);
    }
  } catch (err) {
    console.log(chalk.red(`  ❌ Error: ${(err as Error).message}\n`));
  }
}
