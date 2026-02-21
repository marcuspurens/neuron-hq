import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ManifestManager } from '../src/core/manifest.js';

describe('ManifestManager', () => {
  let tempDir: string;
  let manifestFile: string;
  let manager: ManifestManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-test-'));
    manifestFile = path.join(tempDir, 'manifest.json');
    manager = new ManifestManager(manifestFile);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should create a manifest', async () => {
    const manifest = await manager.create({
      runid: '20260221-1430-test' as any,
      target_name: 'test-repo',
      target_start_sha: 'abc123',
      workspace_branch: 'swarm/test',
    });

    expect(manifest.runid).toBe('20260221-1430-test');
    expect(manifest.commands).toEqual([]);
  });

  it('should add commands', async () => {
    await manager.create({
      runid: '20260221-1430-test' as any,
      target_name: 'test-repo',
      target_start_sha: 'abc123',
      workspace_branch: 'swarm/test',
    });

    await manager.addCommand('pnpm test', 0);
    await manager.addCommand('pnpm lint', 0);

    const manifest = await manager.load();
    expect(manifest.commands).toHaveLength(2);
    expect(manifest.commands[0].command).toBe('pnpm test');
  });

  it('should add checksums', async () => {
    await manager.create({
      runid: '20260221-1430-test' as any,
      target_name: 'test-repo',
      target_start_sha: 'abc123',
      workspace_branch: 'swarm/test',
    });

    await manager.addChecksums({
      'report.md': 'hash123',
      'questions.md': 'hash456',
    });

    const manifest = await manager.load();
    expect(manifest.checksums['report.md']).toBe('hash123');
  });

  it('should mark as completed', async () => {
    await manager.create({
      runid: '20260221-1430-test' as any,
      target_name: 'test-repo',
      target_start_sha: 'abc123',
      workspace_branch: 'swarm/test',
    });

    await manager.complete();

    const manifest = await manager.load();
    expect(manifest.completed_at).toBeDefined();
  });

  it('should compute file checksums', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    await fs.writeFile(testFile, 'test content', 'utf-8');

    const checksum = await ManifestManager.checksumFile(testFile);
    expect(checksum).toHaveLength(64); // SHA-256 hex length
  });
});
