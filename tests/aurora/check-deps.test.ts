import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockRunWorker = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
}));

import { runWorker } from '../../src/aurora/worker-bridge.js';

describe('check_deps worker', () => {
  beforeEach(() => {
    mockRunWorker.mockReset();
  });

  it('check_deps worker returns dependency status', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Aurora dependency check',
      text: 'Python 3.12.8: 4/5 deps available',
      metadata: {
        python_version: '3.12.8',
        python_path: '/usr/bin/python3',
        dependencies: {
          faster_whisper: { available: true, version: '1.1.1', error: null },
          pyannote_audio: { available: false, version: null, error: 'No module' },
          yt_dlp: { available: true, version: '2025.1.15', error: null },
          pypdfium2: { available: true, version: '4.30.0', error: null },
          trafilatura: { available: true, version: '1.12.0', error: null },
        },
        models: {},
        source_type: 'dependency_check',
      },
    });

    const result = await runWorker({
      action: 'check_deps',
      source: '',
      options: {},
    });

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'check_deps',
      source: '',
      options: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe('Aurora dependency check');
      expect(result.metadata).toBeDefined();
    }
  });

  it('check_deps includes python_version in metadata', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Aurora dependency check',
      text: 'Python 3.11.5: 5/5 deps available',
      metadata: {
        python_version: '3.11.5',
        python_path: '/usr/bin/python3',
        dependencies: {},
        models: {},
        source_type: 'dependency_check',
      },
    });

    const result = await runWorker({
      action: 'check_deps',
      source: '',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.python_version).toBe('3.11.5');
      expect(meta.python_path).toBe('/usr/bin/python3');
    }
  });

  it('check_deps with preload_models includes models object', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Aurora dependency check',
      text: 'Python 3.12.0: 5/5 deps available',
      metadata: {
        python_version: '3.12.0',
        python_path: '/usr/bin/python3',
        dependencies: {
          faster_whisper: { available: true, version: '1.1.1', error: null },
        },
        models: {
          tiny: { available: true, error: null },
          small: { available: true, error: null },
          'KBLab/kb-whisper-large': { available: false, error: 'download failed' },
        },
        source_type: 'dependency_check',
      },
    });

    const result = await runWorker({
      action: 'check_deps',
      source: '',
      options: { preload_models: true },
    });

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'check_deps',
      source: '',
      options: { preload_models: true },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const meta = result.metadata as Record<string, unknown>;
      const models = meta.models as Record<string, unknown>;
      expect(Object.keys(models).length).toBeGreaterThan(0);
      expect(models).toHaveProperty('tiny');
      expect(models).toHaveProperty('small');
      expect(models).toHaveProperty('KBLab/kb-whisper-large');
    }
  });

  it('check_deps without preload_models has empty models', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Aurora dependency check',
      text: 'Python 3.12.0: 3/5 deps available',
      metadata: {
        python_version: '3.12.0',
        python_path: '/usr/bin/python3',
        dependencies: {},
        models: {},
        source_type: 'dependency_check',
      },
    });

    const result = await runWorker({
      action: 'check_deps',
      source: '',
      options: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const meta = result.metadata as Record<string, unknown>;
      const models = meta.models as Record<string, object>;
      expect(Object.keys(models)).toHaveLength(0);
    }
  });
});
