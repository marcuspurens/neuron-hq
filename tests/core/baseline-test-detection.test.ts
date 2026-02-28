import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { detectTestStatus } from '../../src/core/baseline.js';

describe('detectTestStatus', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baseline-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects vitest in package.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } })
    );
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(true);
    expect(result.testFramework).toBe('vitest');
  });

  it('detects jest in package.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'jest --coverage' } })
    );
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(true);
    expect(result.testFramework).toBe('jest');
  });

  it('detects pytest in pyproject.toml', async () => {
    await fs.writeFile(
      path.join(tempDir, 'pyproject.toml'),
      '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n'
    );
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(true);
    expect(result.testFramework).toBe('pytest');
  });

  it('returns testsExist: false when no test suite found', async () => {
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(false);
    expect(result.testFramework).toBeNull();
  });

  it('sets correct testFramework for each detected framework', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'mocha' } })
    );
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(true);
    expect(result.testFramework).toBeNull();
  });

  it('detects tests/ directory as fallback', async () => {
    await fs.mkdir(path.join(tempDir, 'tests'));
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(true);
    expect(result.testFramework).toBeNull();
  });

  it('handles empty repo with no config files', async () => {
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(false);
    expect(result.testFramework).toBeNull();
  });

  it('prioritizes package.json over tests/ directory', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } })
    );
    await fs.mkdir(path.join(tempDir, 'tests'));
    const result = await detectTestStatus(tempDir);
    expect(result.testsExist).toBe(true);
    expect(result.testFramework).toBe('vitest');
  });
});
