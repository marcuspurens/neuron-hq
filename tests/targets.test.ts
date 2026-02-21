import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { TargetsManager } from '../src/core/targets.js';

describe('TargetsManager', () => {
  let tempDir: string;
  let targetsFile: string;
  let manager: TargetsManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-test-'));
    targetsFile = path.join(tempDir, 'repos.yaml');
    manager = new TargetsManager(targetsFile);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should return empty array when file does not exist', async () => {
    const targets = await manager.loadTargets();
    expect(targets).toEqual([]);
  });

  it('should add a target', async () => {
    await manager.addTarget({
      name: 'test-repo',
      path: '/path/to/repo',
      default_branch: 'main',
    });

    const targets = await manager.loadTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('test-repo');
  });

  it('should not allow duplicate target names', async () => {
    await manager.addTarget({
      name: 'duplicate',
      path: '/path1',
      default_branch: 'main',
    });

    await expect(
      manager.addTarget({
        name: 'duplicate',
        path: '/path2',
        default_branch: 'main',
      })
    ).rejects.toThrow('already exists');
  });

  it('should get target by name', async () => {
    await manager.addTarget({
      name: 'findme',
      path: '/path',
      default_branch: 'main',
    });

    const target = await manager.getTarget('findme');
    expect(target?.name).toBe('findme');
  });

  it('should remove target', async () => {
    await manager.addTarget({
      name: 'removeme',
      path: '/path',
      default_branch: 'main',
    });

    const removed = await manager.removeTarget('removeme');
    expect(removed).toBe(true);

    const targets = await manager.loadTargets();
    expect(targets).toHaveLength(0);
  });

  it('should list target names', async () => {
    await manager.addTarget({ name: 'repo1', path: '/p1', default_branch: 'main' });
    await manager.addTarget({ name: 'repo2', path: '/p2', default_branch: 'main' });

    const names = await manager.listTargetNames();
    expect(names).toEqual(['repo1', 'repo2']);
  });
});
