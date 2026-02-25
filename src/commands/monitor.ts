import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { TargetsManager } from '../core/targets.js';
import { BASE_DIR } from '../cli.js';

/** Shape of the health.json file produced by health_check.py. */
export interface HealthData {
  status: string;
  tests: { passed: number; total: number };
  components: Array<{ name: string; status: string; detail?: string }>;
  data: { manifests: number; embeddings: number };
}

/**
 * Pure formatting function — returns a multi-line health report string.
 * Separated from I/O for easy testing.
 */
export function formatHealthReport(health: HealthData): string {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const statusIcon = health.status === 'ok' ? '✅' : '❌';
  const title = `Health Report — ${timestamp}`;
  const separator = '─'.repeat(title.length);

  const lines: string[] = [
    title,
    separator,
    `Status:  ${statusIcon} ${health.status}`,
    `Tests:   ${health.tests.passed}/${health.tests.total} passed`,
    '',
    'Components:',
  ];

  for (const comp of health.components) {
    const icon = comp.status === 'ok' ? '✅' : '❌';
    const detail = comp.detail ? ` — ${comp.detail}` : '';
    lines.push(`  ${icon} ${comp.name}${detail}`);
  }

  lines.push('');
  lines.push(
    `Data:    ${health.data.manifests} manifests · ${health.data.embeddings} embeddings`
  );

  return lines.join('\n');
}

/**
 * CLI command: run a health check on a target and display the results.
 */
export async function monitorCommand(targetName: string): Promise<void> {
  // 1. Look up target
  const targetsFile = path.join(BASE_DIR, 'targets', 'repos.yaml');
  const targetsManager = new TargetsManager(targetsFile);
  const target = await targetsManager.getTarget(targetName);

  if (!target) {
    console.error(chalk.red(`Error: Target '${targetName}' not found`));
    process.exit(1);
  }

  // 2. Run health check script
  try {
    execSync('python scripts/health_check.py', {
      cwd: target.path,
      timeout: 60_000,
      stdio: 'pipe',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: Health check failed — ${msg}`));
    process.exit(1);
  }

  // 3. Read health.json
  const healthPath = path.join(target.path, 'data', 'health.json');
  let raw: string;
  try {
    raw = await fs.readFile(healthPath, 'utf-8');
  } catch {
    console.error(chalk.red(`Error: data/health.json not found in ${target.path}`));
    process.exit(1);
    return; // unreachable but helps TS
  }

  const health: HealthData = JSON.parse(raw);

  // 4. Format and print
  console.log(formatHealthReport(health));

  // 5. Exit code
  if (health.status !== 'ok') {
    process.exit(1);
  }
}
