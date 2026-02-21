import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { BASE_DIR } from '../cli.js';

export async function reportCommand(runid: string): Promise<void> {
  try {
    const reportPath = path.join(BASE_DIR, 'runs', runid, 'report.md');

    const content = await fs.readFile(reportPath, 'utf-8');

    console.log(); // Empty line
    console.log(content);
    console.log(); // Empty line

    console.log(chalk.gray(`Report path: ${reportPath}`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(chalk.red(`Report not found for run: ${runid}`));
      process.exit(1);
    }
    throw error;
  }
}
