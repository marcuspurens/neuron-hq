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

describe('GitOperations worktree methods', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuronhq-worktree-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  async function initRepo(dir: string): Promise<GitOperations> {
    const opts = { cwd: dir, env: gitEnv };
    await execAsync('git init', opts);
    await execAsync('git branch -m main', opts);
    await fs.writeFile(path.join(dir, 'file.txt'), 'initial content');
    await execAsync('git add -A && git commit -m "initial"', opts);
    return new GitOperations(dir);
  }

  it('addWorktree creates isolated working directory with new branch', async () => {
    const dir = await makeTmpDir();
    const git = await initRepo(dir);

    const worktreePath = path.join(dir, 'wt-task-1');
    tmpDirs.push(worktreePath);

    await git.addWorktree(worktreePath, 'neuron/test/task-1');

    // Worktree directory exists
    const stat = await fs.stat(worktreePath);
    expect(stat.isDirectory()).toBe(true);

    // File from main branch is present
    const content = await fs.readFile(path.join(worktreePath, 'file.txt'), 'utf-8');
    expect(content).toBe('initial content');

    // Branch is correct in worktree
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath });
    expect(stdout.trim()).toBe('neuron/test/task-1');

    // Main repo still on main
    const { stdout: mainBranch } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: dir });
    expect(mainBranch.trim()).toBe('main');
  });

  it('worktrees are isolated — changes in one do not affect another', async () => {
    const dir = await makeTmpDir();
    const git = await initRepo(dir);

    const wt1 = path.join(dir, 'wt-1');
    const wt2 = path.join(dir, 'wt-2');
    tmpDirs.push(wt1, wt2);

    await git.addWorktree(wt1, 'neuron/test/task-1');
    await git.addWorktree(wt2, 'neuron/test/task-2');

    // Write different files in each worktree
    await fs.writeFile(path.join(wt1, 'task1.txt'), 'task 1 work');
    await fs.writeFile(path.join(wt2, 'task2.txt'), 'task 2 work');

    // task1.txt should NOT exist in wt2
    await expect(fs.access(path.join(wt2, 'task1.txt'))).rejects.toThrow();
    // task2.txt should NOT exist in wt1
    await expect(fs.access(path.join(wt1, 'task2.txt'))).rejects.toThrow();
  });

  it('worktree branches can be merged back to main', async () => {
    const dir = await makeTmpDir();
    const git = await initRepo(dir);

    const wt = path.join(dir, 'wt-feature');
    tmpDirs.push(wt);

    await git.addWorktree(wt, 'neuron/test/feature');

    // Make changes in worktree and commit
    await fs.writeFile(path.join(wt, 'feature.txt'), 'new feature');
    await execAsync('git add -A && git commit -m "add feature"', { cwd: wt, env: gitEnv });

    // Remove worktree before merging
    await git.removeWorktree(wt);

    // Merge branch back into main
    const sha = await git.mergeBranch('neuron/test/feature', 'merge feature worktree');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    // Feature file now exists on main
    const content = await fs.readFile(path.join(dir, 'feature.txt'), 'utf-8');
    expect(content).toBe('new feature');
  });

  it('removeWorktree cleans up directory', async () => {
    const dir = await makeTmpDir();
    const git = await initRepo(dir);

    const wt = path.join(dir, 'wt-cleanup');
    await git.addWorktree(wt, 'neuron/test/cleanup');

    // Directory exists
    await expect(fs.access(wt)).resolves.toBeUndefined();

    // Remove worktree
    await git.removeWorktree(wt);

    // Directory is gone
    await expect(fs.access(wt)).rejects.toThrow();
  });

  it('parallel worktree commits do not conflict', async () => {
    const dir = await makeTmpDir();
    const git = await initRepo(dir);

    const wt1 = path.join(dir, 'wt-parallel-1');
    const wt2 = path.join(dir, 'wt-parallel-2');
    tmpDirs.push(wt1, wt2);

    await git.addWorktree(wt1, 'neuron/test/p1');
    await git.addWorktree(wt2, 'neuron/test/p2');

    // Both write and commit concurrently (different files)
    await Promise.all([
      (async () => {
        await fs.writeFile(path.join(wt1, 'p1.txt'), 'parallel 1');
        await execAsync('git add -A && git commit -m "p1 work"', { cwd: wt1, env: gitEnv });
      })(),
      (async () => {
        await fs.writeFile(path.join(wt2, 'p2.txt'), 'parallel 2');
        await execAsync('git add -A && git commit -m "p2 work"', { cwd: wt2, env: gitEnv });
      })(),
    ]);

    // Clean up worktrees
    await git.removeWorktree(wt1);
    await git.removeWorktree(wt2);

    // Both branches should merge cleanly
    await git.mergeBranch('neuron/test/p1', 'merge p1');
    await git.mergeBranch('neuron/test/p2', 'merge p2');

    // Both files exist on main
    expect(await fs.readFile(path.join(dir, 'p1.txt'), 'utf-8')).toBe('parallel 1');
    expect(await fs.readFile(path.join(dir, 'p2.txt'), 'utf-8')).toBe('parallel 2');
  });
});
