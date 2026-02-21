import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { BASE_DIR } from '../cli.js';
import { ManifestManager } from '../core/manifest.js';
import { Verifier } from '../core/verify.js';

export async function replayCommand(runid: string): Promise<void> {
  try {
    const runDir = path.join(BASE_DIR, 'runs', runid);
    const workspaceDir = path.join(BASE_DIR, 'workspaces', runid);
    const manifestPath = path.join(runDir, 'manifest.json');

    console.log(chalk.cyan(`\nReplaying verification for run: ${runid}\n`));

    // Load manifest
    const manifestManager = new ManifestManager(manifestPath);
    const manifest = await manifestManager.load();

    // Verify checksums
    console.log(chalk.bold('Verifying artifact checksums...'));
    const checksumResult = await manifestManager.verifyChecksums(
      path.join(BASE_DIR, 'runs'),
      runid
    );

    if (checksumResult.valid) {
      console.log(chalk.green('✓ All checksums valid'));
    } else {
      console.log(chalk.red('✗ Checksum mismatches:'));
      for (const mismatch of checksumResult.mismatches) {
        console.log(chalk.red(`  - ${mismatch}`));
      }
    }

    // Re-run verification
    console.log(chalk.bold('\nRe-running verification commands...\n'));

    // Try to find target workspace
    const targetDirs = await fs.readdir(workspaceDir, { withFileTypes: true });
    const targetDir = targetDirs.find((e) => e.isDirectory());

    if (!targetDir) {
      console.log(chalk.yellow('⚠ Workspace not found, skipping verification'));
      return;
    }

    const targetWorkspace = path.join(workspaceDir, targetDir.name);
    const verifier = new Verifier(targetWorkspace);

    const commands = await verifier.discoverCommands();

    if (commands.length === 0) {
      console.log(chalk.yellow('No verification commands found.'));
      return;
    }

    const result = await verifier.verify(commands);

    if (result.success) {
      console.log(chalk.green('\n✓ Verification replay: PASS'));
    } else {
      console.log(chalk.red('\n✗ Verification replay: FAIL'));
    }

    // Write replay report
    const replayReport = verifier.formatMarkdown(result);
    const replayPath = path.join(runDir, 'replay.md');
    await fs.writeFile(replayPath, replayReport, 'utf-8');

    console.log(chalk.gray(`\nReplay report saved: ${replayPath}`));
  } catch (error) {
    console.error(chalk.red('Replay failed:'), error);
    process.exit(1);
  }
}
