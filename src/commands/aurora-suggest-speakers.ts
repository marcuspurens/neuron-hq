import chalk from 'chalk';
import { suggestSpeakerMatches } from '../aurora/voiceprint.js';

/**
 * CLI command: aurora:suggest-speakers
 * Suggests matching speakers across videos.
 */
export async function auroraSuggestSpeakersCommand(options: {
  threshold?: number;
}): Promise<void> {
  console.log(chalk.bold('\n🔍 Searching for speaker matches...\n'));
  const matches = await suggestSpeakerMatches({
    threshold: options.threshold,
  });

  if (matches.length === 0) {
    console.log('  No matches found above threshold.');
    console.log('  Try --threshold 0.5 for weaker matches.\n');
    return;
  }

  console.log(chalk.bold('Suggested matches:'));
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    console.log(
      `  ${i + 1}. ${m.sourceName} (${m.sourceVideo}) ↔ ${m.matchName} (${m.matchVideo})`,
    );
    console.log(
      `     Similarity: ${m.similarity.toFixed(2)} — ${m.reason}`,
    );
  }
  console.log();
}
