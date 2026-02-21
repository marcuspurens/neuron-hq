import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { BASE_DIR } from '../cli.js';

export async function statusCommand(): Promise<void> {
  try {
    const runsDir = path.join(BASE_DIR, 'runs');

    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    const runs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    if (runs.length === 0) {
      console.log(chalk.yellow('No runs found.'));
      return;
    }

    console.log(chalk.bold(`\nRuns (${runs.length}):\n`));

    for (const runid of runs.sort().reverse()) {
      const manifestPath = path.join(runsDir, runid, 'manifest.json');

      try {
        const manifestContent = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        const status = manifest.completed_at ? chalk.green('✓ Complete') : chalk.yellow('⧗ In Progress');
        console.log(`${status} ${chalk.cyan(runid)}`);
        console.log(`  Target: ${manifest.target_name}`);
        console.log(`  Started: ${new Date(manifest.started_at).toLocaleString()}`);

        if (manifest.completed_at) {
          console.log(`  Completed: ${new Date(manifest.completed_at).toLocaleString()}`);
        }

        console.log();
      } catch {
        console.log(chalk.red(`✗ ${runid}`));
        console.log(chalk.gray('  (manifest.json not found or invalid)'));
        console.log();
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(chalk.yellow('No runs directory found.'));
      return;
    }
    throw error;
  }
}
