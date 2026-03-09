import chalk from 'chalk';
import { memoryStats } from '../aurora/memory.js';

export async function auroraMemoryStatsCommand(): Promise<void> {
  console.log(chalk.bold('\n📊 Aurora Memory Stats'));

  try {
    const stats = await memoryStats();

    console.log(`  Facts: ${stats.facts}`);
    console.log(`  Preferences: ${stats.preferences}`);
    console.log(`  Total: ${stats.total}`);
    console.log(`  Avg confidence: ${stats.avgConfidence.toFixed(2)}`);

    console.log('\n  By scope:');
    for (const [scope, count] of Object.entries(stats.byScope)) {
      console.log(`    ${scope}: ${count}`);
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  }
}
