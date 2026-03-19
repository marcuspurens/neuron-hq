import chalk from 'chalk';
import { generateMorningBriefing } from '../aurora/morning-briefing.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('cmd:morning-briefing');

export async function morningBriefingCommand(options: {
  vault?: string;
  date?: string;
  force?: boolean;
}): Promise<void> {
  console.log(chalk.bold('\n☕ Morgon-briefing\n'));

  try {
    const result = await generateMorningBriefing({
      vaultPath: options.vault,
      date: options.date,
      force: options.force,
    });

    console.log(chalk.green(`  ✅ Briefing genererad: ${result.filePath}`));
    console.log(`     Nya noder: ${result.data.newNodes.reduce((s, n) => s + n.count, 0)}`);
    console.log(`     Körningar: ${result.data.runs.length}`);
    console.log(`     Nya idéer: ${result.data.newIdeas.length}`);
    console.log(`     Frågor: ${result.data.questions.length}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('redan genererad')) {
      console.log(chalk.yellow(`  ℹ️ ${err.message}`));
      return;
    }
    console.error(chalk.red(`  ❌ Error: ${err instanceof Error ? err.message : err}`));
    logger.error('Morning briefing failed', { error: String(err) });
  }
}
