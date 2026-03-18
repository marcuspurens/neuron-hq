/**
 * Graceful shutdown handlers for neuron-hq.
 *
 * Registers cleanup callbacks that run on SIGINT/SIGTERM
 * before the process exits.
 */

const cleanupHandlers: Array<() => Promise<void>> = [];

/** Register a cleanup handler to run on shutdown. */
export function onShutdown(handler: () => Promise<void>): void {
  cleanupHandlers.push(handler);
}

/** Install SIGINT/SIGTERM listeners that run all registered cleanup handlers. */
export function installShutdownHandlers(): void {
  const shutdown = async (signal: string): Promise<void> => {
    console.error(`\n[shutdown] ${signal} received — cleaning up...`);
    for (const handler of cleanupHandlers) {
      try {
        await handler();
      } catch {  /* intentional: best-effort cleanup on shutdown */
        /* best effort */
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/** For testing: reset all registered handlers. */
export function _resetHandlers(): void {
  cleanupHandlers.length = 0;
}

/** For testing: get the number of registered handlers. */
export function _getHandlerCount(): number {
  return cleanupHandlers.length;
}
