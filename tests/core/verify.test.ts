import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Verifier } from '../../src/core/verify.js';

describe('Verifier', () => {
  let tempDir: string;
  let verifier: Verifier;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-test-'));
    verifier = new Verifier(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('discoverCommands', () => {
    it('returns empty array when no project files exist', async () => {
      const commands = await verifier.discoverCommands();
      expect(commands).toEqual([]);
    });

    it('returns all four pnpm commands for Node project with full scripts', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ scripts: { typecheck: 'tsc', lint: 'eslint .', test: 'vitest', build: 'tsc' } }),
        'utf-8'
      );
      const commands = await verifier.discoverCommands();
      expect(commands).toContain('pnpm typecheck');
      expect(commands).toContain('pnpm lint');
      expect(commands).toContain('pnpm test');
      expect(commands).toContain('pnpm build');
    });

    it('returns only scripts that exist in package.json', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ scripts: { test: 'vitest' } }),
        'utf-8'
      );
      const commands = await verifier.discoverCommands();
      expect(commands).toContain('pnpm test');
      expect(commands).not.toContain('pnpm typecheck');
      expect(commands).not.toContain('pnpm lint');
      expect(commands).not.toContain('pnpm build');
    });

    it('returns Python commands when pyproject.toml exists', async () => {
      await fs.writeFile(path.join(tempDir, 'pyproject.toml'), '[tool.pytest]\n', 'utf-8');
      const commands = await verifier.discoverCommands();
      expect(commands).toContain('ruff check .');
      expect(commands).toContain('mypy .');
      expect(commands).toContain('pytest');
    });

    it('returns Rust commands when Cargo.toml exists', async () => {
      await fs.writeFile(
        path.join(tempDir, 'Cargo.toml'),
        '[package]\nname = "test"\nversion = "0.1.0"\n',
        'utf-8'
      );
      const commands = await verifier.discoverCommands();
      expect(commands).toContain('cargo check');
      expect(commands).toContain('cargo test');
    });
  });

  describe('verify', () => {
    it('returns success:true and empty results for empty command list', async () => {
      const result = await verifier.verify([]);
      expect(result.success).toBe(true);
      expect(result.commands).toHaveLength(0);
    });

    it('returns success:true and exitCode:0 for a passing command', async () => {
      const result = await verifier.verify(['echo hello']);
      expect(result.success).toBe(true);
      expect(result.commands[0].exitCode).toBe(0);
    });

    it('returns success:false for a failing command', async () => {
      const result = await verifier.verify(['false']);
      expect(result.success).toBe(false);
      expect(result.commands[0].exitCode).not.toBe(0);
    });

    it('marks success:false if any command in the list fails', async () => {
      const result = await verifier.verify(['echo ok', 'false']);
      expect(result.success).toBe(false);
      expect(result.commands).toHaveLength(2);
      expect(result.commands[0].exitCode).toBe(0);
      expect(result.commands[1].exitCode).not.toBe(0);
    });

    it('summary says all passed when all succeed', async () => {
      const result = await verifier.verify(['echo a', 'echo b']);
      expect(result.summary).toContain('All 2 verification(s) passed');
    });

    it('summary reports failure count when some fail', async () => {
      const result = await verifier.verify(['echo ok', 'false']);
      expect(result.summary).toContain('1 of 2 verification(s) failed');
    });
  });

  describe('formatMarkdown', () => {
    it('contains ✅ PASS for successful commands', async () => {
      const result = await verifier.verify(['echo hello']);
      const md = verifier.formatMarkdown(result);
      expect(md).toContain('✅ PASS');
      expect(md).toContain('echo hello');
    });

    it('contains ❌ FAIL for failed commands', async () => {
      const result = await verifier.verify(['false']);
      const md = verifier.formatMarkdown(result);
      expect(md).toContain('❌ FAIL');
    });

    it('includes stdout in output when present', async () => {
      const result = await verifier.verify(['echo unique-output-marker']);
      const md = verifier.formatMarkdown(result);
      expect(md).toContain('unique-output-marker');
    });
  });
});
