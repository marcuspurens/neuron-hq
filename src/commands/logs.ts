import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { BASE_DIR } from '../cli.js';
import { AuditLogger } from '../core/audit.js';

export async function logsCommand(runid: string): Promise<void> {
  try {
    const runDir = path.join(BASE_DIR, 'runs', runid);
    const auditPath = path.join(runDir, 'audit.jsonl');

    console.log(chalk.bold(`\nLogs for run: ${runid}\n`));

    // Show artifact paths
    console.log(chalk.cyan('Artifact Paths:'));
    const artifacts = [
      'brief.md',
      'baseline.md',
      'report.md',
      'questions.md',
      'ideas.md',
      'knowledge.md',
      'audit.jsonl',
      'manifest.json',
      'usage.json',
      'redaction_report.md',
    ];

    for (const artifact of artifacts) {
      const artifactPath = path.join(runDir, artifact);
      try {
        await fs.access(artifactPath);
        console.log(chalk.green(`  ✓ ${artifactPath}`));
      } catch {
        console.log(chalk.gray(`  - ${artifactPath} (not found)`));
      }
    }

    // Show audit log summary
    console.log(chalk.cyan('\nAudit Log Summary:'));
    const audit = new AuditLogger(auditPath);
    const entries = await audit.readAll();

    if (entries.length === 0) {
      console.log(chalk.gray('  No audit entries'));
    } else {
      console.log(`  Total entries: ${entries.length}`);
      console.log(`  Allowed: ${entries.filter((e) => e.allowed).length}`);
      console.log(`  Blocked: ${entries.filter((e) => !e.allowed).length}`);
    }

    console.log(chalk.gray(`\nView full audit log: cat ${auditPath}`));
  } catch (error) {
    console.error(chalk.red('Failed to read logs:'), error);
    process.exit(1);
  }
}
