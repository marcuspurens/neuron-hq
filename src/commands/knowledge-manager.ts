import chalk from 'chalk';
import { KnowledgeManagerAgent, type KMOptions } from '../core/agents/knowledge-manager.js';

/**
 * CLI command: knowledge-manager
 * Run the Knowledge Manager agent to scan for gaps and stale sources.
 */
export async function knowledgeManagerCommand(
  cmdOptions: { topic?: string; maxActions?: string; stale?: boolean },
): Promise<void> {
  const options: KMOptions = {};

  if (cmdOptions.topic) {
    options.focusTopic = cmdOptions.topic;
  }

  if (cmdOptions.maxActions !== undefined) {
    options.maxActions = parseInt(String(cmdOptions.maxActions), 10);
  }

  if (cmdOptions.stale !== undefined) {
    options.includeStale = cmdOptions.stale;
  }

  const audit = {
    log: async (_entry: unknown): Promise<void> => {
      /* noop for CLI */
    },
  };

  try {
    const agent = new KnowledgeManagerAgent(audit, options);
    const report = await agent.run();

    console.log(chalk.bold('\n🧠 Knowledge Manager Report\n'));
    console.log(`  Gaps found:        ${report.gapsFound}`);
    console.log(`  Gaps researched:   ${report.gapsResearched}`);
    console.log(`  Sources refreshed: ${report.sourcesRefreshed}`);
    console.log(`  New nodes created: ${report.newNodesCreated}`);
    console.log(`\n${report.summary}\n`);
  } catch (err) {
    console.error(
      chalk.red(
        `\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`,
      ),
    );
  }
}
