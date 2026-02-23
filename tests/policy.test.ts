import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPolicyEnforcer } from '../src/core/policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');

describe('PolicyEnforcer', () => {
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;

  beforeAll(async () => {
    const policyDir = path.join(BASE_DIR, 'policy');
    policy = await createPolicyEnforcer(policyDir, BASE_DIR);
  });

  describe('checkBashCommand', () => {
    it('should allow commands in allowlist', () => {
      expect(policy.checkBashCommand('ls -la')).toEqual({ allowed: true });
      expect(policy.checkBashCommand('git status')).toEqual({ allowed: true });
      expect(policy.checkBashCommand('pnpm install')).toEqual({ allowed: true });
    });

    it('should allow diff command', () => {
      expect(policy.checkBashCommand('diff file1 file2')).toEqual({ allowed: true });
    });

    it('should block forbidden patterns', () => {
      const rmRf = policy.checkBashCommand('rm -rf /');
      expect(rmRf.allowed).toBe(false);
      expect(rmRf.reason).toContain('forbidden pattern');

      const sudo = policy.checkBashCommand('sudo apt-get install');
      expect(sudo.allowed).toBe(false);
    });

    it('should block commands not in allowlist', () => {
      const result = policy.checkBashCommand('whoami');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not in allowlist');
    });
  });

  describe('checkFileWriteScope', () => {
    it('should allow writes to workspace', () => {
      const runid = '20260221-1430-test';
      const filePath = path.join(BASE_DIR, 'workspaces', runid, 'test.txt');
      expect(policy.checkFileWriteScope(filePath, runid as any)).toEqual({ allowed: true });
    });

    it('should allow writes to runs directory', () => {
      const runid = '20260221-1430-test';
      const filePath = path.join(BASE_DIR, 'runs', runid, 'report.md');
      expect(policy.checkFileWriteScope(filePath, runid as any)).toEqual({ allowed: true });
    });

    it('should block writes outside scope', () => {
      const runid = '20260221-1430-test';
      const filePath = '/tmp/malicious.txt';
      const result = policy.checkFileWriteScope(filePath, runid as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside allowed scope');
    });
  });

  describe('checkDiffSize', () => {
    it('should return OK for small diffs', () => {
      const result = policy.checkDiffSize(50, 30);
      expect(result.status).toBe('OK');
    });

    it('should return WARN for medium diffs', () => {
      const result = policy.checkDiffSize(100, 80);
      expect(result.status).toBe('WARN');
    });

    it('should return BLOCK for large diffs', () => {
      const result = policy.checkDiffSize(200, 150);
      expect(result.status).toBe('BLOCK');
      expect(result.reason).toContain('too large');
    });
  });

  describe('validateRunHours', () => {
    it('should accept valid hours', () => {
      expect(policy.validateRunHours(3).valid).toBe(true);
    });

    it('should reject hours exceeding limit', () => {
      const result = policy.validateRunHours(99);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds limit');
    });
  });
});
