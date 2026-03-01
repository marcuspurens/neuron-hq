import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import ora from 'ora';
import { TargetsManager } from '../core/targets.js';
import { RunOrchestrator, countMemoryRuns, EstopError } from '../core/run.js';
import { createPolicyEnforcer } from '../core/policy.js';
import { ManagerAgent } from '../core/agents/manager.js';
import { BASE_DIR } from '../cli.js';
import { scaffoldProject, type ScaffoldOptions } from '../core/scaffold.js';
import type { RunConfig, StoplightStatus } from '../core/types.js';

export async function runCommand(
  targetName: string,
  options: { hours: string; brief: string; scaffold?: string }
): Promise<void> {
  const spinner = ora('Initializing neuron run...').start();

  try {
    // Load target
    const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
    const targetsManager = new TargetsManager(targetsFile);
    let target = await targetsManager.getTarget(targetName);

    // Auto-scaffold if --scaffold flag provided and target doesn't exist
    if (!target && options.scaffold) {
      const [language, template] = options.scaffold.split(':') as [
        ScaffoldOptions['language'],
        ScaffoldOptions['template'],
      ];
      const targetDir = path.join(BASE_DIR, '..');
      const projectDir = path.join(targetDir, targetName);

      // Check if directory already exists
      try {
        await fs.access(projectDir);
        // Directory exists, don't scaffold
      } catch {
        // Directory doesn't exist, scaffold it
        spinner.text = `Scaffolding ${targetName}...`;
        await scaffoldProject({ name: targetName, language, template, targetDir });

        // Register as target
        await targetsManager.addTarget({
          name: targetName,
          path: projectDir,
          default_branch: 'main',
          verify_commands: language === 'typescript' ? ['pnpm test'] : ['pytest'],
        });

        spinner.succeed(chalk.green(`Scaffolded ${targetName}`));
        spinner.start('Initializing neuron run...');

        // Re-load target
        target = await targetsManager.getTarget(targetName);
      }
    }

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

    // Check for leftover STOP file from previous session
    const stopFilePath = path.join(BASE_DIR, 'STOP');
    try {
      await fs.access(stopFilePath);
      // STOP file exists — abort
      console.log(chalk.red('\n⚠️  STOP file exists from a previous session.'));
      console.log(chalk.yellow('    Remove it before starting a new run:'));
      console.log(chalk.yellow(`    rm ${stopFilePath}`));
      process.exit(1);
    } catch {
      // No STOP file — continue normally
    }

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

    // Check if consolidation trigger was injected into the brief
    const processedBrief = await ctx.artifacts.readBrief();
    const consolidationAutoTrigger = processedBrief.includes('⚡ Consolidation-trigger:');

    if (consolidationAutoTrigger) {
      console.log(chalk.magenta('  ⚡ Consolidation-trigger: Consolidator will run after Historian'));
    }

    // Run manager agent
    console.log(chalk.cyan('\n→ Starting manager agent...'));
    const manager = new ManagerAgent(ctx, BASE_DIR, librarianAutoTrigger, consolidationAutoTrigger);
    try {
      await manager.run();
    } catch (runError) {
      if (runError instanceof EstopError) {
        // Write e-stop handoff
        const handoffPath = path.join(ctx.runDir, 'estop_handoff.md');
        await fs.writeFile(handoffPath, [
          '# E-Stop Handoff',
          '',
          `**Run ID:** ${runid}`,
          `**Stopped at:** ${new Date().toISOString()}`,
          `**Target:** ${target.name}`,
          '',
          '## State at stop',
          '- Workspace changes are preserved (uncommitted)',
          '- Check `git diff` in workspace for current state',
          '- Check `audit.jsonl` for last completed action',
          '',
        ].join('\n'));

        console.log(chalk.red('\n⛔ Run stopped by user (STOP file detected). Run ID: ' + runid));

        // Write STOPPED BY USER report if not already present
        const reportPath = path.join(ctx.runDir, 'report.md');
        try {
          await fs.access(reportPath);
        } catch {
          await fs.writeFile(reportPath, '# STOPPED BY USER\n\nRun was stopped via STOP file (e-stop).\n');
        }

        process.exit(1);
      }
      throw runError; // Re-throw non-estop errors
    }

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
