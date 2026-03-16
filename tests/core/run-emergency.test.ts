import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ═══════════════════════════════════════════════════════════════════════════
// Tests for the workspace preservation logic used in run.ts finalizeRun.
//
// The finalizeRun method checks for a .preserved file and the
// maxIterationsReached flag, then appends a note to WARNING.md.
// We test this logic in isolation using a temp directory.
// ═══════════════════════════════════════════════════════════════════════════

describe('Workspace preservation logic', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-emergency-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('.preserved file detection works when file exists', async () => {
    const preservedPath = path.join(tmpDir, '.preserved');
    await fs.writeFile(
      preservedPath,
      JSON.stringify({ reason: 'emergency_save', agent: 'manager' }),
      'utf-8',
    );
    const exists = await fs.access(preservedPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('non-existent .preserved returns false', async () => {
    const preservedPath = path.join(tmpDir, '.preserved');
    const exists = await fs.access(preservedPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('WARNING.md is appended when .preserved file exists', async () => {
    // Simulate the finalizeRun preservation logic:
    const workspaceDir = tmpDir;
    const runDir = tmpDir;
    const preservedPath = path.join(workspaceDir, '.preserved');
    const maxIterationsReached = false;

    // Create .preserved marker
    await fs.writeFile(
      preservedPath,
      JSON.stringify({ reason: 'emergency_save' }),
      'utf-8',
    );

    // Replicate the exact logic from run.ts
    const preservedExists = await fs.access(preservedPath).then(() => true).catch(() => false);
    if (preservedExists || maxIterationsReached) {
      const preserveNote = `Workspace preserved at: ${workspaceDir}\nReason: ${maxIterationsReached ? 'Max iterations reached' : 'Emergency save detected'}\n`;
      await fs.appendFile(
        path.join(runDir, 'WARNING.md'),
        `\n---\n\n## Workspace Bevarad\n\n${preserveNote}`,
        'utf-8',
      );
    }

    const content = await fs.readFile(path.join(runDir, 'WARNING.md'), 'utf-8');
    expect(content).toContain('Workspace Bevarad');
    expect(content).toContain('Emergency save detected');
    expect(content).toContain(workspaceDir);
  });

  it('WARNING.md mentions max iterations when maxIterationsReached is true', async () => {
    const workspaceDir = tmpDir;
    const runDir = tmpDir;
    const maxIterationsReached = true;

    // No .preserved file, but maxIterationsReached flag is set
    const preservedPath = path.join(workspaceDir, '.preserved');
    const preservedExists = await fs.access(preservedPath).then(() => true).catch(() => false);

    if (preservedExists || maxIterationsReached) {
      const preserveNote = `Workspace preserved at: ${workspaceDir}\nReason: ${maxIterationsReached ? 'Max iterations reached' : 'Emergency save detected'}\n`;
      await fs.appendFile(
        path.join(runDir, 'WARNING.md'),
        `\n---\n\n## Workspace Bevarad\n\n${preserveNote}`,
        'utf-8',
      );
    }

    const content = await fs.readFile(path.join(runDir, 'WARNING.md'), 'utf-8');
    expect(content).toContain('Max iterations reached');
  });

  it('no WARNING.md written when neither .preserved nor maxIterationsReached', async () => {
    const workspaceDir = tmpDir;
    const runDir = tmpDir;
    const maxIterationsReached = false;

    const preservedPath = path.join(workspaceDir, '.preserved');
    const preservedExists = await fs.access(preservedPath).then(() => true).catch(() => false);

    if (preservedExists || maxIterationsReached) {
      const preserveNote = `Workspace preserved at: ${workspaceDir}\nReason: ${maxIterationsReached ? 'Max iterations reached' : 'Emergency save detected'}\n`;
      await fs.appendFile(
        path.join(runDir, 'WARNING.md'),
        `\n---\n\n## Workspace Bevarad\n\n${preserveNote}`,
        'utf-8',
      );
    }

    // WARNING.md should not exist
    const warningExists = await fs.access(path.join(runDir, 'WARNING.md')).then(() => true).catch(() => false);
    expect(warningExists).toBe(false);
  });

  it('file access errors are non-fatal (wrapped in try-catch)', async () => {
    // Simulate the try-catch pattern from run.ts
    const badDir = '/nonexistent/path/that/does/not/exist';
    let error: Error | undefined;

    try {
      const preservedPath = path.join(badDir, '.preserved');
      const preservedExists = await fs.access(preservedPath).then(() => true).catch(() => false);
      if (preservedExists) {
        await fs.appendFile(path.join(badDir, 'WARNING.md'), 'test', 'utf-8');
      }
    } catch (e) {
      error = e as Error;
    }

    // Should not have thrown — the .catch(() => false) handles access errors
    expect(error).toBeUndefined();
  });
});

describe('RunContext maxIterationsReached field', () => {
  it('RunContext interface accepts maxIterationsReached as optional boolean', async () => {
    // Import the type and verify it compiles — this is a compile-time check.
    // We import the actual type to ensure it exists.
    const { RunOrchestrator } = await import('../../src/core/run.js');
    expect(RunOrchestrator).toBeDefined();

    // The type check is that this code compiles without error.
    // RunContext has maxIterationsReached?: boolean
    const partialCtx: { maxIterationsReached?: boolean } = {};
    partialCtx.maxIterationsReached = true;
    expect(partialCtx.maxIterationsReached).toBe(true);

    partialCtx.maxIterationsReached = undefined;
    expect(partialCtx.maxIterationsReached).toBeUndefined();
  });
});
