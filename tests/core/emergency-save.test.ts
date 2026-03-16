import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module-level mocks (hoisted by vitest) ──────────────────────────────────

// Mock child_process exec
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: { writeFile: vi.fn() },
  writeFile: vi.fn(),
}));

// Mock event-bus
vi.mock('../../src/core/event-bus.js', () => ({
  eventBus: { safeEmit: vi.fn() },
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import { exec } from 'child_process';
import fs from 'fs/promises';
import { emergencySave, type EmergencySaveOptions } from '../../src/core/emergency-save.js';
import { eventBus } from '../../src/core/event-bus.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockExec = vi.mocked(exec);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockSafeEmit = vi.mocked(eventBus.safeEmit);

/**
 * Configure mock exec to respond differently for different git commands.
 * Each call to exec receives (cmd, opts, callback?) but since we use promisify,
 * the last argument is the callback.
 */
function setupExecMock(responses: Record<string, { stdout?: string; stderr?: string; error?: Error }>): void {
  mockExec.mockImplementation(((cmd: string, _opts: unknown, callback?: (error: Error | null, result: { stdout: string; stderr: string }) => void) => {
    // promisify(exec) calls exec(cmd, opts, callback)
    const cb = callback ?? (_opts as (error: Error | null, result: { stdout: string; stderr: string }) => void);

    // Find matching response by checking if cmd contains the key
    for (const [key, response] of Object.entries(responses)) {
      if (cmd.includes(key)) {
        if (response.error) {
          cb(response.error, { stdout: '', stderr: '' });
        } else {
          cb(null, { stdout: response.stdout ?? '', stderr: response.stderr ?? '' });
        }
        return;
      }
    }
    // Default: success with empty stdout
    cb(null, { stdout: '', stderr: '' });
  }) as unknown as typeof exec);
}

/** Build default options for emergencySave. */
function makeOptions(overrides?: Partial<EmergencySaveOptions>): EmergencySaveOptions {
  return {
    agentName: 'implementer',
    iteration: 55,
    maxIterations: 70,
    workspaceDir: '/workspace/test-proj',
    runDir: '/runs/test-run',
    runid: 'run-123',
    audit: { log: vi.fn() } as unknown as EmergencySaveOptions['audit'],
    ...overrides,
  };
}

/** Default mock responses for a dirty repo with successful commit. */
function setupDirtyRepo(commitHash = 'abc123def456'): void {
  setupExecMock({
    'git status --porcelain': { stdout: ' M src/index.ts\n?? new-file.ts\n' },
    'git add -A': { stdout: '' },
    'git commit': { stdout: '' },
    'git rev-parse HEAD': { stdout: commitHash + '\n' },
    'git rev-parse --abbrev-ref HEAD': { stdout: 'workspace/task-T1\n' },
  });
}

/** Default mock responses for a clean repo. */
function setupCleanRepo(): void {
  setupExecMock({
    'git status --porcelain': { stdout: '' },
  });
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockWriteFile.mockResolvedValue(undefined);
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 1: No-op cases
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 1: No-op cases (clean repo)', () => {
  it('returns { saved: false } when no uncommitted changes', async () => {
    setupCleanRepo();
    const result = await emergencySave(makeOptions());
    expect(result.saved).toBe(false);
  });

  it('does not call git commit when repo is clean', async () => {
    setupCleanRepo();
    await emergencySave(makeOptions());
    const calls = mockExec.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git commit'))).toBe(false);
  });

  it('does not call audit.log when repo is clean', async () => {
    setupCleanRepo();
    const opts = makeOptions();
    await emergencySave(opts);
    expect(opts.audit.log).not.toHaveBeenCalled();
  });

  it('does not write WARNING.md when repo is clean', async () => {
    setupCleanRepo();
    await emergencySave(makeOptions());
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 2: Emergency commit
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 2: Emergency commit (dirty repo)', () => {
  it('calls git add -A when there are uncommitted changes', async () => {
    setupDirtyRepo();
    await emergencySave(makeOptions());
    const calls = mockExec.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git add -A'))).toBe(true);
  });

  it('calls git commit with correct message', async () => {
    setupDirtyRepo();
    await emergencySave(makeOptions({ agentName: 'reviewer', iteration: 30, maxIterations: 40 }));
    const calls = mockExec.mock.calls.map(c => String(c[0]));
    const commitCall = calls.find(c => c.includes('git commit'));
    expect(commitCall).toBeDefined();
    expect(commitCall).toContain('EMERGENCY SAVE: reviewer');
    expect(commitCall).toContain('30/40');
  });

  it('returns { saved: true, commitHash, message }', async () => {
    setupDirtyRepo('deadbeef1234');
    const result = await emergencySave(makeOptions());
    expect(result.saved).toBe(true);
    expect(result.commitHash).toBe('deadbeef1234');
    expect(result.message).toContain('EMERGENCY SAVE');
  });

  it('commit message contains agent name and iteration count', async () => {
    setupDirtyRepo();
    const result = await emergencySave(makeOptions({ agentName: 'tester', iteration: 10, maxIterations: 20 }));
    expect(result.message).toContain('tester');
    expect(result.message).toContain('10/20');
  });

  it('gets commit hash via git rev-parse HEAD', async () => {
    setupDirtyRepo('face0ff123456');
    const result = await emergencySave(makeOptions());
    expect(result.commitHash).toBe('face0ff123456');
    const calls = mockExec.mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('git rev-parse HEAD'))).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 3: File artifacts
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 3: File artifacts', () => {
  it('writes WARNING.md to runDir with agent name and iteration info', async () => {
    setupDirtyRepo();
    const opts = makeOptions({ agentName: 'merger', iteration: 60, maxIterations: 65 });
    await emergencySave(opts);

    const warningCall = mockWriteFile.mock.calls.find(c =>
      String(c[0]).includes('WARNING.md'),
    );
    expect(warningCall).toBeDefined();
    expect(String(warningCall![0])).toContain('/runs/test-run');
    const content = String(warningCall![1]);
    expect(content).toContain('merger');
    expect(content).toContain('60/65');
  });

  it('writes recovery.md to workspaceDir with cherry-pick instructions', async () => {
    setupDirtyRepo('abc123');
    await emergencySave(makeOptions());

    const recoveryCall = mockWriteFile.mock.calls.find(c =>
      String(c[0]).includes('recovery.md'),
    );
    expect(recoveryCall).toBeDefined();
    expect(String(recoveryCall![0])).toContain('/workspace/test-proj');
    const content = String(recoveryCall![1]);
    expect(content).toContain('cherry-pick');
    expect(content).toContain('abc123');
  });

  it('writes .preserved file as JSON with correct fields', async () => {
    setupDirtyRepo('hash999');
    await emergencySave(makeOptions({ agentName: 'implementer', iteration: 55, maxIterations: 70 }));

    const preservedCall = mockWriteFile.mock.calls.find(c =>
      String(c[0]).endsWith('.preserved'),
    );
    expect(preservedCall).toBeDefined();
    const json = JSON.parse(String(preservedCall![1]));
    expect(json.reason).toBe('emergency_save');
    expect(json.agent).toBe('implementer');
    expect(json.iteration).toBe(55);
    expect(json.maxIterations).toBe(70);
    expect(json.commitHash).toBe('hash999');
    expect(json.branchName).toBe('workspace/task-T1');
    expect(json.timestamp).toBeDefined();
  });

  it('WARNING.md contains branch name', async () => {
    setupDirtyRepo();
    await emergencySave(makeOptions());

    const warningCall = mockWriteFile.mock.calls.find(c =>
      String(c[0]).includes('WARNING.md'),
    );
    expect(warningCall).toBeDefined();
    const content = String(warningCall![1]);
    expect(content).toContain('workspace/task-T1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 4: Audit & events
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 4: Audit & events', () => {
  it('audit.log called with role=agentName and tool=emergency_save', async () => {
    setupDirtyRepo();
    const opts = makeOptions({ agentName: 'implementer' });
    await emergencySave(opts);

    expect(opts.audit.log).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(opts.audit.log).mock.calls[0][0];
    expect(entry.role).toBe('implementer');
    expect(entry.tool).toBe('emergency_save');
  });

  it('eventBus.safeEmit called with warning event', async () => {
    setupDirtyRepo();
    await emergencySave(makeOptions());

    expect(mockSafeEmit).toHaveBeenCalledTimes(1);
    expect(mockSafeEmit.mock.calls[0][0]).toBe('warning');
  });

  it('warning event contains type=max_iterations, correct message, agent, recoveryPath', async () => {
    setupDirtyRepo();
    const opts = makeOptions({ agentName: 'reviewer', runid: 'run-abc' });
    await emergencySave(opts);

    const eventData = mockSafeEmit.mock.calls[0][1] as Record<string, unknown>;
    expect(eventData.type).toBe('max_iterations');
    expect(eventData.agent).toBe('reviewer');
    expect(eventData.runid).toBe('run-abc');
    expect(eventData.recoveryPath).toBe('/workspace/test-proj');
    expect(typeof eventData.message).toBe('string');
    expect(String(eventData.message)).toContain('reviewer');
  });

  it('console.warn called with EMERGENCY SAVE message', async () => {
    setupDirtyRepo();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await emergencySave(makeOptions({ agentName: 'implementer' }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('EMERGENCY SAVE');
    warnSpy.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 5: Error handling
// ═════════════════════════════════════════════════════════════════════════════

describe('Group 5: Error handling', () => {
  it('git status fails → returns { saved: false }', async () => {
    setupExecMock({
      'git status --porcelain': { error: new Error('git not found') },
    });
    const result = await emergencySave(makeOptions());
    expect(result.saved).toBe(false);
  });

  it('git commit fails → returns { saved: false }', async () => {
    setupExecMock({
      'git status --porcelain': { stdout: ' M file.ts\n' },
      'git add -A': { stdout: '' },
      'git commit': { error: new Error('commit failed') },
    });
    const result = await emergencySave(makeOptions());
    expect(result.saved).toBe(false);
  });

  it('file write failures are non-fatal (still returns saved: true if commit succeeded)', async () => {
    setupDirtyRepo('goodhash');
    mockWriteFile.mockRejectedValue(new Error('disk full'));

    const result = await emergencySave(makeOptions());
    expect(result.saved).toBe(true);
    expect(result.commitHash).toBe('goodhash');
  });
});
