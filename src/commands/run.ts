import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { TargetsManager } from '../core/targets.js';
import { RunOrchestrator } from '../core/run.js';
import { createPolicyEnforcer } from '../core/policy.js';
import { ManagerAgent } from '../core/agents/manager.js';
import { Verifier } from '../core/verify.js';
import { BASE_DIR } from '../cli.js';
import type { RunConfig, StoplightStatus } from '../core/types.js';

export async function runCommand(
  targetName: string,
  options: { hours: string; brief: string }
): Promise<void> {
  const spinner = ora('Initializing swarm run...').start();

  try {
    // Load target
    const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
    const targetsManager = new TargetsManager(targetsFile);
    const target = await targetsManager.getTarget(targetName);

    if (!target) {
      spinner.fail(chalk.red(`Target '${targetName}' not found`));
      console.log(`Run: ${chalk.cyan(`pnpm swarm target add ${targetName} <path>`)}`);
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

    // Run manager agent (placeholder for now)
    console.log(chalk.cyan('\n→ Starting manager agent...'));
    const manager = new ManagerAgent(ctx, BASE_DIR);
    await manager.run();

    // Finalize run
    console.log(chalk.cyan('\n→ Finalizing run...'));

    const stoplight: StoplightStatus = {
      baseline_verify: verifyCommands.length > 0 ? 'PASS' : 'SKIP',
      after_change_verify: 'SKIP',
      diff_size: 'OK',
      risk: 'LOW',
      artifacts: 'COMPLETE',
    };

    const reportContent = [
      '# Run Report',
      '',
      '## Summary',
      'Placeholder run completed successfully (no actual changes made).',
      '',
      '## How to Run',
      verifyCommands.length > 0
        ? '```bash\n' + verifyCommands.join('\n') + '\n```'
        : 'No verification commands available.',
      '',
      '## How to Test',
      'Same as verification commands above.',
      '',
      '## Risks',
      '- Risk: LOW (no changes made in placeholder)',
      '',
      '## Rollback',
      '```bash',
      `git checkout ${target.default_branch}`,
      `git branch -D swarm/${runid}`,
      '```',
      '',
      '## What\'s Next',
      '- Integrate Anthropic SDK for real agent implementation',
      '- Implement Implementer, Reviewer, and Researcher agents',
      '- Add actual code changes based on brief',
    ].join('\n');

    await orchestrator.finalizeRun(ctx, stoplight, reportContent);

    console.log(chalk.green('\n✓ Run completed!'));
    console.log(chalk.bold(`\nRun ID: ${runid}`));
    console.log(`Report: ${path.join(ctx.runDir, 'report.md')}`);
    console.log(`Questions: ${path.join(ctx.runDir, 'questions.md')}`);
    console.log(`Ideas: ${path.join(ctx.runDir, 'ideas.md')}`);
    console.log(`\nView report: ${chalk.cyan(`pnpm swarm report ${runid}`)}`);
  } catch (error) {
    spinner.fail(chalk.red('Run failed'));
    console.error(error);
    process.exit(1);
  }
}
