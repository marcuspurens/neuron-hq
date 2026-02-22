import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitOperations } from '../../src/core/git.js';

const execAsync = promisify(exec);

describe('GitOperations.initWorkspace', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuronhq-git-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('creates a valid git repo in the workspace directory', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'hello.txt'), 'hello world');

    await GitOperations.initWorkspace(dir, 'test-target');

    const isRepo = await GitOperations.isGitRepo(dir);
    expect(isRepo).toBe(true);
  });

  it('commits all files in the initial commit', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'file-a.txt'), 'content a');
    await fs.writeFile(path.join(dir, 'file-b.txt'), 'content b');

    await GitOperations.initWorkspace(dir, 'my-target');

    const { stdout } = await execAsync('git log --oneline', { cwd: dir });
    expect(stdout.trim().split('\n')).toHaveLength(1);
    expect(stdout).toContain('Workspace: initial copy from my-target');
  });

  it('leaves working tree clean after init', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'app.py'), 'print("hi")');

    await GitOperations.initWorkspace(dir, 'aurora');

    const git = new GitOperations(dir);
    const status = await git.getStatus();
    expect(status.trim()).toBe('');
  });

  it('workspace git is isolated from neuron-hq parent repo', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'test.py'), 'x = 1');

    await GitOperations.initWorkspace(dir, 'aurora');

    // The git root must be the workspace dir itself, not a parent
    // Use realpath to resolve macOS /var → /private/var symlink
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: dir });
    const realDir = await fs.realpath(dir);
    expect(stdout.trim()).toBe(realDir);
  });
});
