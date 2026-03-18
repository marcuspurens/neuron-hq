import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

export interface VerificationResult {
  success: boolean;
  commands: Array<{
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
  }>;
  summary: string;
}

export class Verifier {
  constructor(
    private workspacePath: string,
    private timeoutSeconds: number = 1800
  ) {}

  /**
   * Discover verification commands from target repo.
   */
  async discoverCommands(): Promise<string[]> {
    const commands: string[] = [];

    // Check for package.json (Node/pnpm)
    try {
      const pkgPath = path.join(this.workspacePath, 'package.json');
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      if (pkg.scripts) {
        if (pkg.scripts.typecheck) commands.push('pnpm typecheck');
        if (pkg.scripts.lint) commands.push('pnpm lint');
        if (pkg.scripts.test) commands.push('pnpm test');
        if (pkg.scripts.build) commands.push('pnpm build');
      }
    } catch {  /* intentional: no package.json or unreadable */
      // No package.json or error reading it
    }

    // Check for pyproject.toml (Python)
    try {
      const pyprojectPath = path.join(this.workspacePath, 'pyproject.toml');
      await fs.access(pyprojectPath);

      // Common Python tools
      commands.push('ruff check .');
      commands.push('mypy .');
      commands.push('pytest');
    } catch {  /* intentional: file may not exist */
      // No pyproject.toml
    }

    // Check for Cargo.toml (Rust)
    try {
      const cargoPath = path.join(this.workspacePath, 'Cargo.toml');
      await fs.access(cargoPath);

      commands.push('cargo check');
      commands.push('cargo test');
    } catch {  /* intentional: file may not exist */
      // No Cargo.toml
    }

    return commands;
  }

  /**
   * Run verification commands.
   */
  async verify(commands: string[]): Promise<VerificationResult> {
    const results: VerificationResult['commands'] = [];
    let allSuccess = true;

    for (const command of commands) {
      const startTime = Date.now();

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: this.workspacePath,
          timeout: this.timeoutSeconds * 1000,
        });

        results.push({
          command,
          exitCode: 0,
          stdout,
          stderr,
          duration: Date.now() - startTime,
        });
      } catch (error: unknown) {
        const execError = error as { code?: number; stdout?: string; stderr?: string };
        allSuccess = false;

        results.push({
          command,
          exitCode: execError.code || 1,
          stdout: execError.stdout || '',
          stderr: execError.stderr || String(error),
          duration: Date.now() - startTime,
        });
      }
    }

    const summary = this.generateSummary(results);

    return {
      success: allSuccess,
      commands: results,
      summary,
    };
  }

  private generateSummary(
    results: VerificationResult['commands']
  ): string {
    const passed = results.filter((r) => r.exitCode === 0).length;
    const failed = results.length - passed;

    if (failed === 0) {
      return `✅ All ${results.length} verification(s) passed`;
    } else {
      return `❌ ${failed} of ${results.length} verification(s) failed`;
    }
  }

  /**
   * Format verification result as markdown.
   */
  formatMarkdown(result: VerificationResult): string {
    const lines = [
      '# Verification Results',
      '',
      result.summary,
      '',
      '## Commands',
      '',
    ];

    for (const cmd of result.commands) {
      const status = cmd.exitCode === 0 ? '✅ PASS' : '❌ FAIL';
      const duration = (cmd.duration / 1000).toFixed(1);

      lines.push(`### ${status} - \`${cmd.command}\` (${duration}s)`);
      lines.push('');

      if (cmd.stdout) {
        lines.push('**Output:**');
        lines.push('```');
        lines.push(cmd.stdout.trim());
        lines.push('```');
        lines.push('');
      }

      if (cmd.stderr) {
        lines.push('**Errors:**');
        lines.push('```');
        lines.push(cmd.stderr.trim());
        lines.push('```');
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
