import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  onShutdown,
  installShutdownHandlers,
  _resetHandlers,
  _getHandlerCount,
} from '../../src/core/shutdown.js';

beforeEach(() => {
  _resetHandlers();
});

// =====================================================
// 1. Registration tests
// =====================================================
describe('onShutdown', () => {
  it('registers a handler (count goes from 0 to 1)', () => {
    expect(_getHandlerCount()).toBe(0);
    onShutdown(async () => {});
    expect(_getHandlerCount()).toBe(1);
  });

  it('registers multiple handlers', () => {
    onShutdown(async () => {});
    onShutdown(async () => {});
    onShutdown(async () => {});
    expect(_getHandlerCount()).toBe(3);
  });
});

// =====================================================
// 2. Reset tests
// =====================================================
describe('_resetHandlers', () => {
  it('clears all registered handlers', () => {
    onShutdown(async () => {});
    onShutdown(async () => {});
    expect(_getHandlerCount()).toBe(2);

    _resetHandlers();
    expect(_getHandlerCount()).toBe(0);
  });
});

// =====================================================
// 3. installShutdownHandlers tests
// =====================================================
describe('installShutdownHandlers', () => {
  it('registers SIGINT and SIGTERM listeners', () => {
    const processOnSpy = vi.spyOn(process, 'on');

    installShutdownHandlers();

    const registeredSignals = processOnSpy.mock.calls.map((call) => call[0]);
    expect(registeredSignals).toContain('SIGINT');
    expect(registeredSignals).toContain('SIGTERM');

    processOnSpy.mockRestore();
  });
});

// =====================================================
// 4. Shutdown execution tests
// =====================================================
describe('shutdown execution', () => {
  it('calls all handlers when signal listener fires', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Capture the SIGINT callback
    let sigintCallback: (() => void) | undefined;
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      cb: () => void,
    ) => {
      if (event === 'SIGINT') sigintCallback = cb;
      return process;
    }) as typeof process.on);

    const callOrder: number[] = [];
    onShutdown(async () => { callOrder.push(1); });
    onShutdown(async () => { callOrder.push(2); });

    installShutdownHandlers();
    expect(sigintCallback).toBeDefined();

    // Fire the captured callback
    sigintCallback!();

    // Allow async handlers to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callOrder).toEqual([1, 2]);
    expect(exitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('handler errors do not break the chain', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let sigintCallback: (() => void) | undefined;
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      cb: () => void,
    ) => {
      if (event === 'SIGINT') sigintCallback = cb;
      return process;
    }) as typeof process.on);

    const callOrder: number[] = [];
    onShutdown(async () => { callOrder.push(1); });
    onShutdown(async () => { throw new Error('boom'); });
    onShutdown(async () => { callOrder.push(3); });

    installShutdownHandlers();
    sigintCallback!();

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Handler 1 and 3 should still run despite handler 2 throwing
    expect(callOrder).toEqual([1, 3]);
    expect(exitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('calls process.exit(0) after handlers complete', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let sigintCallback: (() => void) | undefined;
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      cb: () => void,
    ) => {
      if (event === 'SIGINT') sigintCallback = cb;
      return process;
    }) as typeof process.on);

    installShutdownHandlers();
    sigintCallback!();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('logs the signal name to stderr', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let sigtermCallback: (() => void) | undefined;
    const processOnSpy = vi.spyOn(process, 'on').mockImplementation(((
      event: string,
      cb: () => void,
    ) => {
      if (event === 'SIGTERM') sigtermCallback = cb;
      return process;
    }) as typeof process.on);

    installShutdownHandlers();
    sigtermCallback!();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('SIGTERM')
    );

    processOnSpy.mockRestore();
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
