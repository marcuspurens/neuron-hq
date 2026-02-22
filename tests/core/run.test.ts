import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { countMemoryRuns } from '../../src/core/run.js';

describe('countMemoryRuns', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('returns 0 when memory dir does not exist', async () => {
    const count = await countMemoryRuns('/tmp/does-not-exist-neuron-test');
    expect(count).toBe(0);
  });

  it('returns 0 when runs.md does not exist', async () => {
    const dir = await makeTmpDir();
    const count = await countMemoryRuns(dir);
    expect(count).toBe(0);
  });

  it('returns 0 for empty runs.md', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'runs.md'), '# Runs\n\n');
    const count = await countMemoryRuns(dir);
    expect(count).toBe(0);
  });

  it('counts a single run entry', async () => {
    const dir = await makeTmpDir();
    await fs.writeFile(path.join(dir, 'runs.md'), '# Runs\n\n## Körning 20260222-1757-aurora\n\nDetails.\n');
    const count = await countMemoryRuns(dir);
    expect(count).toBe(1);
  });

  it('counts multiple run entries', async () => {
    const dir = await makeTmpDir();
    const content = [
      '# Runs',
      '',
      '## Körning 20260222-1400-aurora',
      'First run.',
      '',
      '## Körning 20260222-1500-aurora',
      'Second run.',
      '',
      '## Körning 20260222-1600-aurora',
      'Third run.',
    ].join('\n');
    await fs.writeFile(path.join(dir, 'runs.md'), content);
    const count = await countMemoryRuns(dir);
    expect(count).toBe(3);
  });

  it('does not count lines without the Körning prefix', async () => {
    const dir = await makeTmpDir();
    const content = [
      '# Runs',
      '### Körning (not a real header)',
      '## KörningExtra should not match',
      '## Körning 20260222-1400-real',
    ].join('\n');
    await fs.writeFile(path.join(dir, 'runs.md'), content);
    const count = await countMemoryRuns(dir);
    expect(count).toBe(1);
  });
});
