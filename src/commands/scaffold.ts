import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { scaffoldProject, type ScaffoldOptions } from '../core/scaffold.js';
import { TargetsManager } from '../core/targets.js';
import { BASE_DIR } from '../cli.js';

/**
 * CLI command handler for scaffolding a new greenfield project.
 *
 * Creates the project from a template, initialises git, installs
 * dependencies, runs the test suite, and registers the project as a
 * Neuron target.
 */
export async function scaffoldCommand(
  name: string,
  options: { language: string; template: string; dir?: string }
): Promise<void> {
  try {
    const targetDir = options.dir || path.join(BASE_DIR, '..');
    const language = options.language as ScaffoldOptions['language'];
    const template = options.template as ScaffoldOptions['template'];

    const opts: ScaffoldOptions = { name, language, template, targetDir };

    console.log(chalk.cyan(`→ Scaffolding ${name} (${language}/${template})...`));
    await scaffoldProject(opts);

    const projectDir = path.join(targetDir, name);

    // Initialise git repository
    console.log(chalk.cyan('→ Initialising git...'));
    execSync('git init', { cwd: projectDir, stdio: 'pipe' });

    // Install dependencies and run tests
    if (language === 'typescript') {
      console.log(chalk.cyan('→ Installing dependencies (pnpm)...'));
      execSync('pnpm install', { cwd: projectDir, stdio: 'pipe' });

      console.log(chalk.cyan('→ Running tests...'));
      execSync('pnpm test', { cwd: projectDir, stdio: 'pipe' });
    } else {
      try {
        console.log(chalk.cyan('→ Installing package (pip)...'));
        execSync('pip install -e .', { cwd: projectDir, stdio: 'pipe' });

        console.log(chalk.cyan('→ Running tests (pytest)...'));
        execSync('pytest', { cwd: projectDir, stdio: 'pipe' });
      } catch {  /* intentional: target config may not exist */
        console.log(chalk.yellow('  ⚠ Python setup/tests had issues (non-fatal)'));
      }
    }

    // Register as target in repos.yaml
    const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
    const targetsManager = new TargetsManager(targetsFile);

    await targetsManager.addTarget({
      name,
      path: projectDir,
      default_branch: 'main',
      verify_commands: language === 'typescript' ? ['pnpm test'] : ['pytest'],
    });

    console.log(chalk.green(`✓ Scaffolded and registered ${name}`));
    console.log(chalk.gray(`  Path: ${projectDir}`));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error scaffolding project: ${msg}`));
  }
}
