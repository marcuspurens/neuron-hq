import path from 'path';
import chalk from 'chalk';
import { TargetsManager } from '../core/targets.js';
import { TargetSchema } from '../core/types.js';
import { BASE_DIR } from '../cli.js';

export async function targetAddCommand(
  name: string,
  pathOrUrl: string,
  options: { branch?: string; verify?: string[] }
): Promise<void> {
  try {
    const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
    const manager = new TargetsManager(targetsFile);

    // Resolve path if it's a local path
    let resolvedPath = pathOrUrl;
    if (!pathOrUrl.startsWith('http://') && !pathOrUrl.startsWith('https://')) {
      resolvedPath = path.resolve(pathOrUrl);
    }

    const target = TargetSchema.parse({
      name,
      path: resolvedPath,
      default_branch: options.branch || 'main',
      verify_commands: options.verify,
    });

    await manager.addTarget(target);

    console.log(chalk.green(`✓ Added target '${name}'`));
    console.log(`  Path: ${resolvedPath}`);
    console.log(`  Branch: ${target.default_branch}`);
    if (target.verify_commands && target.verify_commands.length > 0) {
      console.log(`  Verify: ${target.verify_commands.join(', ')}`);
    }
  } catch (error) {
    console.error(chalk.red('Error adding target:'), error);
    process.exit(1);
  }
}

export async function targetListCommand(): Promise<void> {
  try {
    const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
    const manager = new TargetsManager(targetsFile);

    const targets = await manager.loadTargets();

    if (targets.length === 0) {
      console.log(chalk.yellow('No targets configured.'));
      console.log(`Run: ${chalk.cyan('pnpm swarm target add <name> <path>')}`);
      return;
    }

    console.log(chalk.bold(`\nTargets (${targets.length}):\n`));

    for (const target of targets) {
      console.log(chalk.cyan(`• ${target.name}`));
      console.log(`  Path: ${target.path}`);
      console.log(`  Branch: ${target.default_branch}`);
      if (target.verify_commands && target.verify_commands.length > 0) {
        console.log(`  Verify: ${target.verify_commands.join(', ')}`);
      }
      console.log();
    }
  } catch (error) {
    console.error(chalk.red('Error listing targets:'), error);
    process.exit(1);
  }
}
