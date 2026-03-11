import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockRunWorker = vi.fn();
const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
  isWorkerAvailable: (...args: unknown[]) => mockIsWorkerAvailable(...args),
}));

import { auroraCheckDepsCommand } from '../../src/commands/aurora-check-deps.js';

describe('auroraCheckDepsCommand', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
    mockIsWorkerAvailable.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows error when Python worker not available', async () => {
    mockIsWorkerAvailable.mockResolvedValue(false);
    await auroraCheckDepsCommand({});
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Python worker not available'));
    expect(mockRunWorker).not.toHaveBeenCalled();
  });

  it('shows error when worker returns error', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockRunWorker.mockResolvedValue({ ok: false, error: 'something broke' });
    await auroraCheckDepsCommand({});
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('something broke'));
  });

  it('displays dependency check results', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: '',
      text: '',
      metadata: {
        python_version: '3.11.5',
        python_path: '/usr/bin/python3',
        source_type: 'check_deps',
        dependencies: {
          faster_whisper: { available: true, version: '0.10.0', error: null },
          yt_dlp: { available: false, version: null, error: 'not installed' },
        },
        models: {},
      },
    });

    await auroraCheckDepsCommand({});

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'check_deps',
      source: '',
      options: { preload_models: false },
    });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Python: 3.11.5'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('faster-whisper'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0.10.0'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('yt-dlp'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('not installed'));
  });

  it('passes preloadModels option to worker', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: '',
      text: '',
      metadata: {
        python_version: '3.11.5',
        python_path: '/usr/bin/python3',
        source_type: 'check_deps',
        dependencies: {},
        models: {
          'tiny': { available: true, error: null },
        },
      },
    });

    await auroraCheckDepsCommand({ preloadModels: true });

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'check_deps',
      source: '',
      options: { preload_models: true },
    });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Models'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('tiny'));
  });

  it('shows install hints for missing dependencies', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: '',
      text: '',
      metadata: {
        python_version: '3.11.5',
        python_path: '/usr/bin/python3',
        source_type: 'check_deps',
        dependencies: {
          pypdfium2: { available: false, version: null, error: 'not found' },
        },
        models: {},
      },
    });

    await auroraCheckDepsCommand({});
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('pip install pypdfium2'));
  });
});
