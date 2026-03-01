import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { countMemoryRuns, countCompletedRuns, maybeInjectMetaTrigger, maybeInjectConsolidationTrigger, RunOrchestrator, COPY_SKIP_DIRS, type RunContext, EstopError, checkEstop } from '../../src/core/run.js';
import { GitOperations } from '../../src/core/git.js';
import { PolicyEnforcer } from '../../src/core/policy.js';
import { AuditLogger } from '../../src/core/audit.js';
import { type RunConfig, type RunId, type StoplightStatus } from '../../src/core/types.js';

const mockPolicy = { getLimits: () => ({ verification_timeout_seconds: 30 }), validateBrief: () => {} } as unknown as PolicyEnforcer;

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

describe('maybeInjectMetaTrigger', () => {
  it('injects trigger at run 10, 20, 30', () => {
    const brief = 'Test brief';
    for (const count of [10, 20, 30]) {
      const result = maybeInjectMetaTrigger(brief, count);
      expect(result).toContain('⚡ Meta-trigger: META_ANALYSIS');
    }
  });

  it('does NOT inject trigger at run 9, 11, 15', () => {
    const brief = 'Test brief';
    for (const count of [9, 11, 15]) {
      const result = maybeInjectMetaTrigger(brief, count);
      expect(result).not.toContain('⚡ Meta-trigger: META_ANALYSIS');
    }
  });

  it('does NOT inject trigger at run 0', () => {
    const result = maybeInjectMetaTrigger('Test brief', 0);
    expect(result).not.toContain('⚡ Meta-trigger: META_ANALYSIS');
  });
});

describe('maybeInjectConsolidationTrigger', () => {
  it('injects trigger when runCount is a multiple of consolidationFrequency', () => {
    const brief = 'Test brief';
    for (const count of [10, 20, 30]) {
      const result = maybeInjectConsolidationTrigger(brief, count, 10);
      expect(result).toContain('⚡ Consolidation-trigger:');
    }
  });

  it('does NOT inject trigger when runCount is not a multiple', () => {
    const brief = 'Test brief';
    for (const count of [9, 11, 15]) {
      const result = maybeInjectConsolidationTrigger(brief, count, 10);
      expect(result).not.toContain('⚡ Consolidation-trigger:');
    }
  });

  it('does NOT inject trigger at run 0', () => {
    const result = maybeInjectConsolidationTrigger('Test brief', 0, 10);
    expect(result).not.toContain('⚡ Consolidation-trigger:');
  });

  it('respects custom consolidation frequency', () => {
    expect(maybeInjectConsolidationTrigger('brief', 5, 5)).toContain('⚡ Consolidation-trigger:');
    expect(maybeInjectConsolidationTrigger('brief', 7, 5)).not.toContain('⚡ Consolidation-trigger:');
  });

  it('does NOT inject trigger when frequency is 0', () => {
    const result = maybeInjectConsolidationTrigger('brief', 10, 0);
    expect(result).not.toContain('⚡ Consolidation-trigger:');
  });

  it('uses default frequency of 10 when not specified', () => {
    expect(maybeInjectConsolidationTrigger('brief', 10)).toContain('⚡ Consolidation-trigger:');
    expect(maybeInjectConsolidationTrigger('brief', 5)).not.toContain('⚡ Consolidation-trigger:');
  });
});

describe('countCompletedRuns', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('counts directories excluding -resume suffix', async () => {
    const tmpDir = path.join(os.tmpdir(), `test-runs-${Date.now()}`);
    tmpDirs.push(tmpDir);
    await fs.mkdir(tmpDir, { recursive: true });

    // Create regular run dirs
    await fs.mkdir(path.join(tmpDir, '20260101-0001-test'));
    await fs.mkdir(path.join(tmpDir, '20260101-0002-test'));
    await fs.mkdir(path.join(tmpDir, '20260101-0003-test'));
    // Create resume dir (should be excluded)
    await fs.mkdir(path.join(tmpDir, '20260101-0004-test-resume'));

    const count = await countCompletedRuns(tmpDir);
    expect(count).toBe(3);
  });

  it('returns 0 for non-existent directory', async () => {
    const count = await countCompletedRuns('/tmp/nonexistent-dir-12345');
    expect(count).toBe(0);
  });
});

describe('RunOrchestrator.isTimeExpired', () => {
  it('returns false when endTime is in the future', () => {
    const orchestrator = new RunOrchestrator();
    const ctx = { endTime: new Date(Date.now() + 60_000) } as RunContext;
    expect(orchestrator.isTimeExpired(ctx)).toBe(false);
  });

  it('returns true when endTime is in the past', () => {
    const orchestrator = new RunOrchestrator();
    const ctx = { endTime: new Date(Date.now() - 1_000) } as RunContext;
    expect(orchestrator.isTimeExpired(ctx)).toBe(true);
  });
});

describe('RunOrchestrator.getTimeRemainingMs', () => {
  it('returns positive ms when endTime is in the future', () => {
    const orchestrator = new RunOrchestrator();
    const ctx = { endTime: new Date(Date.now() + 60_000) } as RunContext;
    const remaining = orchestrator.getTimeRemainingMs(ctx);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });

  it('returns 0 when endTime is in the past', () => {
    const orchestrator = new RunOrchestrator();
    const ctx = { endTime: new Date(Date.now() - 1_000) } as RunContext;
    expect(orchestrator.getTimeRemainingMs(ctx)).toBe(0);
  });

  it('returns 0 when endTime is exactly now', () => {
    const orchestrator = new RunOrchestrator();
    const ctx = { endTime: new Date(Date.now() - 1) } as RunContext;
    expect(orchestrator.getTimeRemainingMs(ctx)).toBe(0);
  });
});

describe('RunOrchestrator.generateRunId', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('returns id matching YYYYMMDD-HHMM-slug format', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(tmpDir);
    const orch = new RunOrchestrator(tmpDir, mockPolicy);
    const id = orch.generateRunId('my-slug');
    expect(id).toMatch(/^\d{8}-\d{4}-my-slug$/);
  });

  it('includes provided slug in run ID', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(tmpDir);
    const orch = new RunOrchestrator(tmpDir, mockPolicy);
    const id = orch.generateRunId('custom-slug');
    expect(id).toContain('custom-slug');
  });
});

describe('RunOrchestrator.resumeRun', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('throws descriptive error when old workspace does not exist', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(tmpDir);
    const orch = new RunOrchestrator(tmpDir, mockPolicy);
    const oldRunId = '20260101-0000-old-run';
    const newRunId = '20260101-0001-new-run';
    const target = { name: 'test-target', path: '/tmp/fake', default_branch: 'main' };
    await expect(orch.resumeRun(oldRunId, newRunId, target, 60))
      .rejects.toThrow(/not found/);
    await expect(orch.resumeRun(oldRunId, newRunId, target, 60))
      .rejects.toThrow(oldRunId);
  });

  it('uses oldRunId-based workspace directory path', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(tmpDir);
    const orch = new RunOrchestrator(tmpDir, mockPolicy);
    const oldRunId = '20260101-0000-old-run';
    const newRunId = '20260101-0001-new-run';
    const targetName = 'test-target';
    const target = { name: targetName, path: '/tmp/fake', default_branch: 'main' };
    const workspaceDir = path.join(tmpDir, 'workspaces', oldRunId, targetName);
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(path.join(workspaceDir, 'README.md'), '# test');
    await GitOperations.initWorkspace(workspaceDir, targetName);
    await fs.mkdir(path.join(tmpDir, 'runs'), { recursive: true });

    const ctx = await orch.resumeRun(oldRunId, newRunId, target, 60);
    expect(ctx.workspaceDir).toBe(workspaceDir);
  });

  it('falls back to placeholder brief when old brief.md is missing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(tmpDir);
    const orch = new RunOrchestrator(tmpDir, mockPolicy);
    const oldRunId = '20260101-0000-old-run';
    const newRunId = '20260101-0001-new-run';
    const targetName = 'test-target';
    const target = { name: targetName, path: '/tmp/fake', default_branch: 'main' };
    const workspaceDir = path.join(tmpDir, 'workspaces', oldRunId, targetName);
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.writeFile(path.join(workspaceDir, 'README.md'), '# test');
    await GitOperations.initWorkspace(workspaceDir, targetName);
    await fs.mkdir(path.join(tmpDir, 'runs'), { recursive: true });

    const ctx = await orch.resumeRun(oldRunId, newRunId, target, 60);
    const briefPath = path.join(tmpDir, 'runs', ctx.runid, 'brief.md');
    const briefContent = await fs.readFile(briefPath, 'utf-8');
    expect(briefContent).toContain('Resumed from');
  });
});

describe('COPY_SKIP_DIRS', () => {
  it('contains expected skip directories', () => {
    expect(COPY_SKIP_DIRS.has('.git')).toBe(true);
    expect(COPY_SKIP_DIRS.has('node_modules')).toBe(true);
    expect(COPY_SKIP_DIRS.has('workspaces')).toBe(true);
    expect(COPY_SKIP_DIRS.has('runs')).toBe(true);
    expect(COPY_SKIP_DIRS.has('.venv')).toBe(true);
  });
});

describe('RunOrchestrator.initRun', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function setup() {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(baseDir);
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-source-'));
    tmpDirs.push(sourceDir);
    await fs.writeFile(path.join(sourceDir, 'README.md'), '# test source');
    const briefFile = path.join(baseDir, 'brief.md');
    await fs.writeFile(briefFile, '# Test Brief\n\nTest content.');

    const orch = new RunOrchestrator(baseDir, mockPolicy);
    const runid = '20260101-0000-test' as RunId;
    const config: RunConfig = {
      runid,
      target: { name: 'test-target', path: sourceDir, default_branch: 'main' },
      hours: 1,
      brief_path: briefFile,
    };
    const ctx = await orch.initRun(config);
    return { baseDir, ctx, runid };
  }

  it('creates workspace directory at correct path', async () => {
    const { baseDir, ctx, runid } = await setup();
    expect(ctx.workspaceDir).toBe(path.join(baseDir, 'workspaces', runid, 'test-target'));
    await fs.access(ctx.workspaceDir);
  });

  it('creates run directory at correct path', async () => {
    const { baseDir, ctx, runid } = await setup();
    expect(ctx.runDir).toBe(path.join(baseDir, 'runs', runid));
    await fs.access(ctx.runDir);
  });

  it('sets endTime to approximately hours from now', async () => {
    const { ctx } = await setup();
    const diff = Math.abs(ctx.endTime.getTime() - (Date.now() + 1 * 3600_000));
    expect(diff).toBeLessThan(5000);
  });
});

describe('RunOrchestrator.finalizeRun', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function setup() {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-run-test-'));
    tmpDirs.push(baseDir);
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-source-'));
    tmpDirs.push(sourceDir);
    await fs.writeFile(path.join(sourceDir, 'README.md'), '# test source');
    const briefFile = path.join(baseDir, 'brief.md');
    await fs.writeFile(briefFile, '# Test Brief\n\nTest content.');

    const orch = new RunOrchestrator(baseDir, mockPolicy);
    const runid = '20260101-0000-test' as RunId;
    const config: RunConfig = {
      runid,
      target: { name: 'test-target', path: sourceDir, default_branch: 'main' },
      hours: 1,
      brief_path: briefFile,
    };
    const ctx = await orch.initRun(config);
    return { orch, ctx };
  }

  const stoplight: StoplightStatus = {
    baseline_verify: 'PASS',
    after_change_verify: 'PASS',
    diff_size: 'OK',
    risk: 'LOW',
    artifacts: 'COMPLETE',
  };

  it('writes report.md to runDir', async () => {
    const { orch, ctx } = await setup();
    await orch.finalizeRun(ctx, stoplight, '# Test Report');
    const content = await fs.readFile(path.join(ctx.runDir, 'report.md'), 'utf-8');
    expect(content).toContain('# Test Report');
  });

  it('writes usage.json to runDir', async () => {
    const { orch, ctx } = await setup();
    await orch.finalizeRun(ctx, stoplight, '');
    await fs.access(path.join(ctx.runDir, 'usage.json'));
  });

  it('writes redaction_report.md to runDir', async () => {
    const { orch, ctx } = await setup();
    await orch.finalizeRun(ctx, stoplight, '');
    await fs.access(path.join(ctx.runDir, 'redaction_report.md'));
  });
});

describe('EstopError', () => {
  it('is an instance of Error', () => {
    const err = new EstopError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('EstopError');
    expect(err.message).toBe('test');
  });
});

describe('checkEstop', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'neuron-estop-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('does nothing when STOP file does not exist', async () => {
    const dir = await makeTmpDir();
    const auditPath = path.join(dir, 'audit.jsonl');
    const audit = new AuditLogger(auditPath);
    await expect(checkEstop(dir, audit)).resolves.toBeUndefined();
  });

  it('throws EstopError when STOP file exists', async () => {
    const dir = await makeTmpDir();
    const auditPath = path.join(dir, 'audit.jsonl');
    await fs.writeFile(path.join(dir, 'STOP'), '');
    const audit = new AuditLogger(auditPath);
    await expect(checkEstop(dir, audit)).rejects.toThrow(EstopError);
    await expect(checkEstop(dir, audit)).rejects.toThrow('STOP file detected');
  });

  it('logs ESTOP event to audit when STOP file exists', async () => {
    const dir = await makeTmpDir();
    const auditPath = path.join(dir, 'audit.jsonl');
    await fs.writeFile(path.join(dir, 'STOP'), '');
    const audit = new AuditLogger(auditPath);
    try {
      await checkEstop(dir, audit);
    } catch { /* expected */ }
    const entries = await audit.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].policy_event).toBe('ESTOP: STOP file detected');
    expect(entries[0].tool).toBe('checkEstop');
  });

  it('does not delete the STOP file', async () => {
    const dir = await makeTmpDir();
    const stopPath = path.join(dir, 'STOP');
    const auditPath = path.join(dir, 'audit.jsonl');
    await fs.writeFile(stopPath, '');
    const audit = new AuditLogger(auditPath);
    try {
      await checkEstop(dir, audit);
    } catch { /* expected */ }
    // Verify STOP file still exists
    await expect(fs.access(stopPath)).resolves.toBeUndefined();
  });
});
