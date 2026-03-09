import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import type { WorkerRequest, WorkerResponse } from '../../src/aurora/worker-bridge.js';

/* ------------------------------------------------------------------ */
/*  Mock child_process                                                 */
/* ------------------------------------------------------------------ */

const mockSpawn = vi.fn();
const mockExecFileAsync = vi.fn();

vi.mock('child_process', () => {
  // Build a fake execFile that carries a promisify.custom so
  // `promisify(execFile)` returns our async mock.
  const fakeExecFile = (() => {}) as any;
  fakeExecFile[promisify.custom] = (...args: unknown[]) =>
    mockExecFileAsync(...args);

  return {
    spawn: (...args: unknown[]) => mockSpawn(...args),
    execFile: fakeExecFile,
  };
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Create a mock ChildProcess with EventEmitter-based stdout/stderr. */
function createMockProc() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  return proc;
}

/**
 * Set up mockSpawn to return a mock process that emits the given
 * stdout/stderr data and exits with the given code.
 */
function setupSpawn(stdout: string, stderr: string, exitCode: number) {
  const proc = createMockProc();
  mockSpawn.mockReturnValue(proc);

  // Schedule events on next tick so the caller can attach listeners first
  queueMicrotask(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  });

  return proc;
}

/** Set up mockSpawn to return a process that emits an error event. */
function setupSpawnError(error: Error) {
  const proc = createMockProc();
  mockSpawn.mockReturnValue(proc);

  queueMicrotask(() => {
    proc.emit('error', error);
  });

  return proc;
}

/* ------------------------------------------------------------------ */
/*  Tests — runWorker                                                  */
/* ------------------------------------------------------------------ */

describe('runWorker', () => {
  let runWorker: (
    req: WorkerRequest,
    opts?: { timeout?: number; pythonPath?: string },
  ) => Promise<WorkerResponse>;

  beforeEach(async () => {
    vi.resetModules();
    mockSpawn.mockReset();
    mockExecFileAsync.mockReset();

    const mod = await import('../../src/aurora/worker-bridge.js');
    runWorker = mod.runWorker;
  });

  it('sends JSON on stdin and reads JSON result from stdout', async () => {
    const expected: WorkerResponse = {
      ok: true,
      title: 'Test',
      text: 'Hello world',
      metadata: { source_type: 'text', word_count: 2 },
    };
    setupSpawn(JSON.stringify(expected), '', 0);

    const req: WorkerRequest = { action: 'extract_text', source: 'hello' };
    const result = await runWorker(req, { pythonPath: 'python3' });

    expect(result).toEqual(expected);
    // Verify stdin was called with the serialized request
    const proc = mockSpawn.mock.results[0].value;
    expect(proc.stdin.write).toHaveBeenCalledWith(JSON.stringify(req));
    expect(proc.stdin.end).toHaveBeenCalled();
  });

  it('handles worker returning ok: false as WorkerError', async () => {
    const errorResponse = { ok: false, error: 'Simulated worker failure' };
    setupSpawn(JSON.stringify(errorResponse), '', 0);

    const req: WorkerRequest = { action: 'extract_text', source: 'bad' };
    const result = await runWorker(req);

    expect(result).toEqual(errorResponse);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Simulated worker failure');
    }
  });

  it('rejects with error when worker returns invalid JSON', async () => {
    setupSpawn('not valid json {{{', '', 0);

    const req: WorkerRequest = { action: 'extract_text', source: 'test' };
    await expect(runWorker(req)).rejects.toThrow('Worker returned invalid JSON');
  });

  it('rejects on spawn error (e.g. executable not found)', async () => {
    const spawnErr = new Error('spawn /nonexistent ENOENT');
    setupSpawnError(spawnErr);

    const req: WorkerRequest = { action: 'extract_text', source: 'test' };
    await expect(runWorker(req)).rejects.toThrow('spawn /nonexistent ENOENT');
  });

  it('rejects on non-zero exit code with no stdout', async () => {
    setupSpawn('', 'something went wrong', 1);

    const req: WorkerRequest = { action: 'extract_text', source: 'test' };
    await expect(runWorker(req)).rejects.toThrow('Worker failed (exit 1)');
  });

  it('still parses stdout JSON even on non-zero exit code', async () => {
    const errorResponse = { ok: false, error: 'Handled error' };
    setupSpawn(JSON.stringify(errorResponse), 'stderr noise', 1);

    const req: WorkerRequest = { action: 'extract_text', source: 'test' };
    const result = await runWorker(req);
    expect(result).toEqual(errorResponse);
  });

  it('passes pythonPath and mainScript to spawn', async () => {
    const ok: WorkerResponse = {
      ok: true,
      title: '',
      text: '',
      metadata: { source_type: 'text', word_count: 0 },
    };
    setupSpawn(JSON.stringify(ok), '', 0);

    const req: WorkerRequest = { action: 'extract_text', source: 'x' };
    await runWorker(req, { pythonPath: '/custom/python' });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockSpawn.mock.calls[0];
    expect(cmd).toBe('/custom/python');
    expect(args[0]).toContain('__main__.py');
  });
});

/* ------------------------------------------------------------------ */
/*  Tests — isWorkerAvailable                                          */
/* ------------------------------------------------------------------ */

describe('isWorkerAvailable', () => {
  let isWorkerAvailable: (pythonPath?: string) => Promise<boolean>;

  beforeEach(async () => {
    vi.resetModules();
    mockSpawn.mockReset();
    mockExecFileAsync.mockReset();

    const mod = await import('../../src/aurora/worker-bridge.js');
    isWorkerAvailable = mod.isWorkerAvailable;
  });

  it('returns true when python command succeeds with ok output', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'ok\n', stderr: '' });

    const result = await isWorkerAvailable('python3');
    expect(result).toBe(true);
    expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
    expect(mockExecFileAsync.mock.calls[0][0]).toBe('python3');
  });

  it('returns false when python command fails', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('Command failed'));

    const result = await isWorkerAvailable('/nonexistent/python');
    expect(result).toBe(false);
  });

  it('returns false when python outputs unexpected text', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'unexpected\n', stderr: '' });

    const result = await isWorkerAvailable('python3');
    expect(result).toBe(false);
  });

  it('uses AURORA_PYTHON_PATH env var when no arg provided', async () => {
    const original = process.env.AURORA_PYTHON_PATH;
    process.env.AURORA_PYTHON_PATH = '/env/python';

    mockExecFileAsync.mockResolvedValue({ stdout: 'ok\n', stderr: '' });

    const result = await isWorkerAvailable();
    expect(result).toBe(true);
    expect(mockExecFileAsync.mock.calls[0][0]).toBe('/env/python');

    if (original !== undefined) {
      process.env.AURORA_PYTHON_PATH = original;
    } else {
      delete process.env.AURORA_PYTHON_PATH;
    }
  });
});
