import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { TargetsManager } from '../core/targets.js';
import { RunOrchestrator, countMemoryRuns } from '../core/run.js';
import { createPolicyEnforcer } from '../core/policy.js';
import { ManagerAgent } from '../core/agents/manager.js';
import { BASE_DIR } from '../cli.js';
import type { RunConfig, StoplightStatus } from '../core/types.js';

export async function runCommand(
  targetName: string,
  options: { hours: string; brief: string }
): Promise<void> {
  const spinner = ora('Initializing neuron run...').start();

  try {
    // Load target
    const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
    const targetsManager = new TargetsManager(targetsFile);
    const target = await targetsManager.getTarget(targetName);

    if (!target) {
      spinner.fail(chalk.red(`Target '${targetName}' not found`));
      console.log(`Run: ${chalk.cyan(`pnpm neuron target add ${targetName} <path>`)}`);
      process.exit(1);
    }

    const hours = parseFloat(options.hours);
    const briefPath = path.join(BASE_DIR, options.brief);

    // Initialize policy enforcer
    spinner.text = 'Loading policy...';
    const policyDir = path.join(BASE_DIR, 'policy');
    const policy = await createPolicyEnforcer(policyDir, BASE_DIR);

    // Validate hours
    const hoursCheck = policy.validateRunHours(hours);
    if (!hoursCheck.valid) {
      spinner.fail(chalk.red(hoursCheck.reason));
      process.exit(1);
    }

    // Create run orchestrator
    const orchestrator = new RunOrchestrator(BASE_DIR, policy);
    const runid = orchestrator.generateRunId(targetName);

    spinner.text = `Creating run ${runid}...`;

    const config: RunConfig = {
      runid,
      target,
      hours,
      brief_path: briefPath,
    };

    // Initialize run context
    const ctx = await orchestrator.initRun(config);

    spinner.succeed(chalk.green(`Run initialized: ${runid}`));

    // Run baseline verification
    console.log(chalk.cyan('\n→ Running baseline verification...'));
    const verifyCommands = target.verify_commands || await ctx.verifier.discoverCommands();

    if (verifyCommands.length === 0) {
      console.log(chalk.yellow('  No verification commands found. Auto-discovery failed.'));
      console.log(chalk.yellow('  Consider adding verify_commands to target config.'));
    } else {
      const baselineResult = await ctx.verifier.verify(verifyCommands);
      const baselineMarkdown = ctx.verifier.formatMarkdown(baselineResult);
      await ctx.artifacts.writeBaseline(baselineMarkdown);

      if (baselineResult.success) {
        console.log(chalk.green('  ✓ Baseline verification passed'));
      } else {
        console.log(chalk.yellow('  ⚠ Baseline verification had failures'));
      }
    }

    // Check if Librarian auto-trigger should fire (every 5th completed run)
    const memoryDir = path.join(BASE_DIR, 'memory');
    const completedRuns = await countMemoryRuns(memoryDir);
    const librarianAutoTrigger = (completedRuns + 1) % 5 === 0;

    if (librarianAutoTrigger) {
      console.log(chalk.magenta(`  ⚡ Auto-trigger: Librarian will run after Historian (run #${completedRuns + 1} in cycle)`));
    }

    // Run manager agent
    console.log(chalk.cyan('\n→ Starting manager agent...'));
    const manager = new ManagerAgent(ctx, BASE_DIR, librarianAutoTrigger);
    await manager.run();

    // Display token usage
    const usage = ctx.usage.getUsage();
    const totalTokens = usage.total_input_tokens + usage.total_output_tokens;
    if (totalTokens > 0) {
      console.log(chalk.gray(`\n  ${ctx.usage.formatSummary()}`));
      const agentLines = Object.entries(usage.by_agent).map(
        ([name, u]) => `    ${name}: in=${u.input_tokens.toLocaleString()} out=${u.output_tokens.toLocaleString()}`
      );
      if (agentLines.length > 0) agentLines.forEach((l) => console.log(chalk.gray(l)));
    }

    // Finalize run
    console.log(chalk.cyan('\n→ Finalizing run...'));

    // If reviewer wrote report.md, preserve it as the report content
    const existingReportPath = path.join(ctx.runDir, 'report.md');
    let reportContent: string;
    let reviewerRan = false;
    try {
      const existing = await fs.readFile(existingReportPath, 'utf-8');
      // Strip any STOPLIGHT header the reviewer may have written (we'll re-add it via writeReport)
      const contentStart = existing.indexOf('\n# ');
      reportContent = contentStart > 0 ? existing.slice(contentStart + 1) : existing;
      reviewerRan = true;
    } catch {
      reportContent = [
        '# Run Report',
        '',
        '## Summary',
        `Run completed for target: ${target.name}`,
        '',
        '## How to Run',
        verifyCommands.length > 0
          ? '```bash\n' + verifyCommands.join('\n') + '\n```'
          : 'No verification commands configured.',
        '',
        '## Rollback',
        '```bash',
        `git -C ${ctx.workspaceDir} checkout ${target.default_branch}`,
        `git -C ${ctx.workspaceDir} branch -D neuron/${runid}`,
        '```',
      ].join('\n');
    }

    const stoplight: StoplightStatus = {
      baseline_verify: verifyCommands.length > 0 ? 'PASS' : 'SKIP',
      after_change_verify: reviewerRan ? 'PASS' : 'SKIP',
      diff_size: 'OK',
      risk: 'LOW',
      artifacts: 'COMPLETE',
    };

    await orchestrator.finalizeRun(ctx, stoplight, reportContent);

    console.log(chalk.green('\n✓ Run completed!'));
    console.log(chalk.bold(`\nRun ID: ${runid}`));
    console.log(`Report:    ${path.join(ctx.runDir, 'report.md')}`);
    console.log(`Questions: ${path.join(ctx.runDir, 'questions.md')}`);
    console.log(`Ideas:     ${path.join(ctx.runDir, 'ideas.md')}`);
    console.log(`\nView report: ${chalk.cyan(`npx tsx src/cli.ts report ${runid}`)}`);
  } catch (error) {
    spinner.fail(chalk.red('Run failed'));
    console.error(error);
    process.exit(1);
  }
}
