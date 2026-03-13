import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { detectTestStatus } from '../../src/core/baseline.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baseline-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('detectTestStatus', () => {
  it('detects vitest from package.json scripts.test containing vitest', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest run' } })
    );
    const result = await detectTestStatus(tmpDir);
    expect(result).toEqual({ testsExist: true, testFramework: 'vitest' });
  });

  it('detects jest from package.json scripts.test containing jest', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'jest' } })
    );
    const result = await detectTestStatus(tmpDir);
    expect(result).toEqual({ testsExist: true, testFramework: 'jest' });
  });

  it('detects unknown framework from package.json with test script not matching vitest/jest', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { test: 'mocha' } })
    );
    const result = await detectTestStatus(tmpDir);
    expect(result).toEqual({ testsExist: true, testFramework: null });
  });

  it('detects pytest from pyproject.toml with [tool.pytest.ini_options]', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'pyproject.toml'),
      '[tool.pytest.ini_options]\ntestpaths = ["tests"]'
    );
    const result = await detectTestStatus(tmpDir);
    expect(result).toEqual({ testsExist: true, testFramework: 'pytest' });
  });

  it('detects tests/ directory existence', async () => {
    await fs.mkdir(path.join(tmpDir, 'tests'));
    const result = await detectTestStatus(tmpDir);
    expect(result).toEqual({ testsExist: true, testFramework: null });
  });

  it('returns no tests for empty directory', async () => {
    const result = await detectTestStatus(tmpDir);
    expect(result).toEqual({ testsExist: false, testFramework: null });
  });

  it('package.json without scripts.test falls through to other checks', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test' })
    );
    await fs.mkdir(path.join(tmpDir, 'tests'));
    const result = await detectTestStatus(tmpDir);
    expect(result).toEqual({ testsExist: true, testFramework: null });
  });
});
