import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitOperations } from '../../src/core/git.js';

const execAsync = promisify(exec);

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
};

describe('GitOperations merge methods', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuronhq-merge-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  /**
   * Set up a git repo with a main branch and a feature branch.
   * If conflicting is true, both branches modify file.txt differently.
   */
  async function setupRepoWithBranch(tmpDir: string, conflicting: boolean = false): Promise<GitOperations> {
    const opts = { cwd: tmpDir, env: gitEnv };

    // 1. Init repo, ensure branch is named "main", create file, commit
    await execAsync('git init', opts);
    await execAsync('git branch -m main', opts);
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'main content');
    await execAsync('git add -A && git commit -m "initial"', opts);

    // 2. Create feature branch with changes
    await execAsync('git checkout -b feature-branch', opts);
    await fs.writeFile(path.join(tmpDir, 'feature.txt'), 'feature content');
    if (conflicting) {
      // Modify the same file that main will also modify
      await fs.writeFile(path.join(tmpDir, 'file.txt'), 'feature changed this');
    }
    await execAsync('git add -A && git commit -m "feature commit"', opts);

    // 3. Go back to main
    await execAsync('git checkout main', opts);

    if (conflicting) {
      // Make conflicting change on main
      await fs.writeFile(path.join(tmpDir, 'file.txt'), 'main changed this differently');
      await execAsync('git add -A && git commit -m "main conflict"', opts);
    }

    return new GitOperations(tmpDir);
  }

  it('detectMergeConflicts — clean merge returns empty array', async () => {
    const dir = await makeTmpDir();
    const git = await setupRepoWithBranch(dir, false);
    const conflicts = await git.detectMergeConflicts('feature-branch');
    expect(conflicts).toEqual([]);
  });

  it('detectMergeConflicts — conflict returns file list', async () => {
    const dir = await makeTmpDir();
    const git = await setupRepoWithBranch(dir, true);
    const conflicts = await git.detectMergeConflicts('feature-branch');
    expect(conflicts).toContain('file.txt');
  });

  it('mergeBranch — clean merge returns SHA', async () => {
    const dir = await makeTmpDir();
    const git = await setupRepoWithBranch(dir, false);
    const sha = await git.mergeBranch('feature-branch', 'merge feature');
    // Valid 40-char hex SHA
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    // Verify commit message
    const { stdout } = await execAsync('git log -1 --pretty=%s', { cwd: dir });
    expect(stdout.trim()).toContain('merge feature');
  });

  it('mergeBranch — conflict throws Error', async () => {
    const dir = await makeTmpDir();
    const git = await setupRepoWithBranch(dir, true);
    await expect(
      git.mergeBranch('feature-branch', 'merge'),
    ).rejects.toThrow();
  });

  it('deleteBranch — deletes branch', async () => {
    const dir = await makeTmpDir();
    const git = await setupRepoWithBranch(dir, false);
    // Merge first (clean) so feature-branch can be deleted
    await git.mergeBranch('feature-branch', 'merge before delete');
    await git.deleteBranch('feature-branch');
    // Verify branch no longer exists
    const { stdout } = await execAsync('git branch --list feature-branch', { cwd: dir });
    expect(stdout.trim()).toBe('');
  });
});
