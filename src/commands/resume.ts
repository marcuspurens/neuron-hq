import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { TargetsManager } from '../core/targets.js';
import { RunOrchestrator } from '../core/run.js';
import { createPolicyEnforcer } from '../core/policy.js';
import { ManagerAgent } from '../core/agents/manager.js';
import { BASE_DIR } from '../cli.js';
import { RunIdSchema, type RunId, type StoplightStatus } from '../core/types.js';

export async function resumeCommand(runid: string, options: { hours: string }): Promise<void> {
  const spinner = ora('Loading previous run...').start();

  try {
    // Validate runid format
    const parseResult = RunIdSchema.safeParse(runid);
    if (!parseResult.success) {
      spinner.fail(chalk.red(`Invalid run ID format: '${runid}'`));
      console.log(chalk.gray('Expected format: YYYYMMDD-HHMM-<slug>'));
      process.exit(1);
    }

    // Load old run manifest
    const oldRunDir = path.join(BASE_DIR, 'runs', runid);
    const manifestPath = path.join(oldRunDir, 'manifest.json');

    let manifest: { target_name: string; completed_at?: string; workspace_branch?: string };
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
    } catch {
      spinner.fail(chalk.red(`Run '${runid}' not found`));
      console.log(`List runs: ${chalk.cyan('npx tsx src/cli.ts status')}`);
      process.exit(1);
    }

    const hours = parseFloat(options.hours);
    if (isNaN(hours) || hours <= 0) {
      spinner.fail(chalk.red(`Invalid hours value: '${options.hours}'`));
      process.exit(1);
    }

    // Load target
    spinner.text = 'Loading target...';
    const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
    const targetsManager = new TargetsManager(targetsFile);
    const target = await targetsManager.getTarget(manifest.target_name);

    if (!target) {
      spinner.fail(chalk.red(`Target '${manifest.target_name}' is no longer registered`));
      console.log(`Register it again: ${chalk.cyan(`npx tsx src/cli.ts target add ${manifest.target_name} <path>`)}`);
      process.exit(1);
    }

    // Load policy
    spinner.text = 'Loading policy...';
    const policyDir = path.join(BASE_DIR, 'policy');
    const policy = await createPolicyEnforcer(policyDir, BASE_DIR);

    const hoursCheck = policy.validateRunHours(hours);
    if (!hoursCheck.valid) {
      spinner.fail(chalk.red(hoursCheck.reason));
      process.exit(1);
    }

    // Create orchestrator and resumed run context
    const orchestrator = new RunOrchestrator(BASE_DIR, policy);
    const newRunId = orchestrator.generateRunId(`${manifest.target_name}-resume`);

    spinner.text = `Creating resumed run ${newRunId}...`;
    const ctx = await orchestrator.resumeRun(
      runid as RunId,
      newRunId as RunId,
      target,
      hours
    );

    spinner.succeed(chalk.green(`Resumed run initialized: ${newRunId}`));
    console.log(chalk.gray(`  Previous run: ${runid}`));
    if (manifest.completed_at) {
      console.log(chalk.gray(`  Previous run completed at: ${new Date(manifest.completed_at).toLocaleString()}`));
    } else {
      console.log(chalk.yellow('  Note: previous run was incomplete — resuming from its workspace state'));
    }

    // Run manager agent
    console.log(chalk.cyan('\n→ Starting manager agent (resumed)...'));
    const manager = new ManagerAgent(ctx, BASE_DIR);
    await manager.run();

    // Finalize run
    console.log(chalk.cyan('\n→ Finalizing run...'));

    const stoplight: StoplightStatus = {
      baseline_verify: 'SKIP',
      after_change_verify: 'SKIP',
      diff_size: 'OK',
      risk: 'LOW',
      artifacts: 'COMPLETE',
    };

    const reportContent = [
      '# Resume Run Report',
      '',
      `## Resumed From: ${runid}`,
      '',
      '## Summary',
      `This run resumed work from a previous session (${runid}).`,
      `The workspace state was preserved and the manager continued from where it left off.`,
      '',
      '## Target',
      `- Name: ${target.name}`,
      `- Branch: swarm/${runid}`,
      '',
      '## Rollback',
      '```bash',
      `git -C ${ctx.workspaceDir} checkout ${target.default_branch}`,
      `git -C ${ctx.workspaceDir} branch -D swarm/${runid}`,
      '```',
    ].join('\n');

    await orchestrator.finalizeRun(ctx, stoplight, reportContent);

    console.log(chalk.green('\n✓ Resumed run completed!'));
    console.log(chalk.bold(`\nRun ID: ${newRunId}`));
    console.log(`Report:    ${path.join(ctx.runDir, 'report.md')}`);
    console.log(`Questions: ${path.join(ctx.runDir, 'questions.md')}`);
    console.log(`Ideas:     ${path.join(ctx.runDir, 'ideas.md')}`);
    console.log(`\nView report: ${chalk.cyan(`npx tsx src/cli.ts report ${newRunId}`)}`);
  } catch (error) {
    spinner.fail(chalk.red('Resume failed'));
    console.error(error);
    process.exit(1);
  }
}
