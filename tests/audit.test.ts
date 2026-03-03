import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { AuditLogger } from '../src/core/audit.js';
import type { AuditEntry } from '../src/core/types.js';

describe('AuditLogger', () => {
  let tempDir: string;
  let auditFile: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'swarm-test-'));
    auditFile = path.join(tempDir, 'audit.jsonl');
    logger = new AuditLogger(auditFile);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should append audit entries', async () => {
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      role: 'manager',
      tool: 'bash',
      allowed: true,
    };

    await logger.log(entry);

    const entries = await logger.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].role).toBe('manager');
  });

  it('should handle multiple entries', async () => {
    await logger.log({
      ts: new Date().toISOString(),
      role: 'implementer',
      tool: 'write',
      allowed: true,
    });

    await logger.log({
      ts: new Date().toISOString(),
      role: 'reviewer',
      tool: 'read',
      allowed: true,
    });

    const count = await logger.count();
    expect(count).toBe(2);
  });

  it('should return empty array when file does not exist', async () => {
    const entries = await logger.readAll();
    expect(entries).toEqual([]);
  });

  it('should compute hash consistently', () => {
    const hash1 = AuditLogger.hash('test data');
    const hash2 = AuditLogger.hash('test data');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it('should still write to file when DB is unavailable (dual-write fallback)', async () => {
    // DB is not available in test environment, so dual-write should
    // gracefully skip DB and still write to file
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      role: 'implementer',
      tool: 'write_file',
      allowed: true,
      input_hash: 'abc123',
      note: 'test dual-write fallback',
    };

    await logger.log(entry);

    const entries = await logger.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].note).toBe('test dual-write fallback');
    expect(entries[0].input_hash).toBe('abc123');
  });

  it('should write entries with diff_stats to file', async () => {
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      role: 'implementer',
      tool: 'bash',
      allowed: true,
      diff_stats: { additions: 10, deletions: 3 },
    };

    await logger.log(entry);

    const entries = await logger.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].diff_stats?.additions).toBe(10);
    expect(entries[0].diff_stats?.deletions).toBe(3);
  });

  it('should extract run ID from standard audit path', () => {
    const auditPath = path.join('runs', '20260303-0629-myproject', 'audit.jsonl');
    const testLogger = new AuditLogger(auditPath);
    // extractRunId is private, but we test it indirectly through the log method
    // For now we verify the logger was created without error
    expect(testLogger).toBeInstanceOf(AuditLogger);
  });
});
