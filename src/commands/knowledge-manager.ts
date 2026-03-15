import chalk from 'chalk';
import { KnowledgeManagerAgent, type KMOptions } from '../core/agents/knowledge-manager.js';
import { logKMRun } from '../aurora/km-log.js';

/**
 * CLI command: knowledge-manager
 * Run the Knowledge Manager agent to scan for gaps and stale sources.
 */
export async function knowledgeManagerCommand(
  cmdOptions: { topic?: string; maxActions?: string; stale?: boolean; chain?: boolean; maxCycles?: string },
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

  if (cmdOptions.chain) {
    options.chain = true;
  }
  if (cmdOptions.maxCycles !== undefined) {
    options.maxCycles = parseInt(String(cmdOptions.maxCycles), 10);
  }

  const audit = {
    log: async (_entry: unknown): Promise<void> => {
      /* noop for CLI */
    },
  };

  try {
    const agent = new KnowledgeManagerAgent(audit, options);
    const startMs = Date.now();
    const report = await agent.run();
    const durationMs = Date.now() - startMs;

    // Log KM run (non-fatal)
    try {
      await logKMRun({
        trigger: 'manual-cli',
        topic: cmdOptions.topic,
        report,
        durationMs,
        chainId: report.chainId,
        cycleNumber: report.cycleNumber,
        stoppedBy: report.stoppedBy,
      });
    } catch {
      // Non-fatal: logging failure should not break CLI output
    }

    console.log(chalk.bold('\n🧠 Knowledge Manager Report\n'));
    console.log(`  Gaps found:        ${report.gapsFound}`);
    console.log(`  Gaps researched:   ${report.gapsResearched}`);
    console.log(`  Sources refreshed: ${report.sourcesRefreshed}`);
    console.log(`  New nodes created: ${report.newNodesCreated}`);

    if (report.chainId) {
      console.log(chalk.dim(`  Chain ID:          ${report.chainId}`));
      console.log(chalk.dim(`  Cycles:            ${report.totalCycles}`));
      console.log(chalk.dim(`  Emergent gaps:     ${report.emergentGapsFound ?? 0}`));
      console.log(chalk.dim(`  Stopped by:        ${report.stoppedBy}`));
    }

    console.log(`\n${report.summary}\n`);
  } catch (err) {
    console.error(
      chalk.red(
        `\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`,
      ),
    );
  }
}

/**
 * CLI command: chain-status
 * Show all cycles for a specific KM chain.
 */
export async function chainStatusCommand(chainId: string): Promise<void> {
  const { getChainStatus } = await import('../aurora/km-log.js');
  const entries = await getChainStatus(chainId);

  if (entries.length === 0) {
    console.log(chalk.yellow(`No chain found with ID: ${chainId}`));
    return;
  }

  console.log(chalk.bold(`\n🔗 Chain Status: ${chainId}\n`));
  for (const entry of entries) {
    const date = new Date(entry.createdAt).toISOString().slice(0, 19);
    console.log(`  Cycle ${entry.cycleNumber}: gaps=${entry.gapsFound}→${entry.gapsResearched}→${entry.gapsResolved}  stopped=${entry.stoppedBy ?? '-'}  ${date}`);
  }
  console.log('');
}
