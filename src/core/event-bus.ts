import { EventEmitter } from 'node:events';

/**
 * Typed event map for all Neuron agent observability events.
 */
export interface EventMap {
  'run:start': { runid: string; target: string; hours: number; startTime: string };
  'run:end': { runid: string; duration: number; status?: string };
  'agent:start': { runid: string; agent: string; task?: string; taskId?: string };
  'agent:end': { runid: string; agent: string; result?: string; error?: string };
  'agent:text': { runid: string; agent: string; text: string };
  'agent:thinking': { runid: string; agent: string; text: string };
  'iteration': { runid: string; agent: string; current: number; max: number };
  'task:status': {
    runid: string;
    taskId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    branch?: string;
  };
  'stoplight': { runid: string; status: 'GREEN' | 'YELLOW' | 'RED' };
  'tokens': { runid: string; agent: string; input: number; output: number };
  'time': { runid: string; elapsed: number; remaining: number; percent: number };
  'audit': Record<string, unknown>;
  'decision': {
    runid: string;
    agent: string;
    decision: import('./decision-extractor.js').Decision;
  };
  'warning': {
    runid: string;
    type: 'max_iterations' | 'merge_failed' | 'test_timeout';
    message: string;
    agent: string;
    recoveryPath?: string;
  };
}

/** Single history entry stored in the circular buffer. */
interface HistoryEntry {
  event: string;
  data: unknown;
  timestamp: string;
}

type AnyCallback = (event: string, data: unknown) => void;

const MAX_HISTORY = 200;

/**
 * Typed singleton EventBus for agent observability.
 *
 * Wraps Node's EventEmitter with type-safe emit, a circular history buffer,
 * wildcard listener support, and per-event counters.
 */
export class NeuronEventBus extends EventEmitter {
  /** Circular buffer of recent events (max 200 entries). */
  public history: HistoryEntry[] = [];

  /** Counter per event type for diagnostics. */
  public eventCounts: Map<string, number> = new Map();

  private _anyCallbacks: Set<AnyCallback> = new Set();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Type-safe emit that never throws.
   * Catches ALL errors from listeners, logs to console.error,
   * and always records to history + counters.
   */
  safeEmit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    // Always record history
    this._recordHistory(event as string, data);

    // Always increment counter
    this._incrementCount(event as string);

    try {
      this.emit(event, data);
    } catch (err: unknown) {
      console.error(`[EventBus] Error emitting ${String(event)}: ${err}`);
    }

    // Notify wildcard listeners (outside the main try so one bad listener
    // does not prevent others from being called)
    for (const cb of this._anyCallbacks) {
      try {
        cb(event as string, data);
      } catch (err: unknown) {
        console.error(`[EventBus] Error in onAny callback: ${err}`);
      }
    }
  }

  /**
   * Register a wildcard listener that receives every event.
   */
  onAny(callback: AnyCallback): void {
    this._anyCallbacks.add(callback);
  }

  /**
   * Remove a previously registered wildcard listener.
   */
  removeOnAny(callback: AnyCallback): void {
    this._anyCallbacks.delete(callback);
  }

  /** Clear the history buffer. */
  resetHistory(): void {
    this.history = [];
  }

  /** Clear all event counters. */
  resetCounts(): void {
    this.eventCounts.clear();
  }

  // ── private helpers ──────────────────────────────────────────

  private _recordHistory(event: string, data: unknown): void {
    this.history.push({
      event,
      data,
      timestamp: new Date().toISOString(),
    });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }

  private _incrementCount(event: string): void {
    this.eventCounts.set(event, (this.eventCounts.get(event) ?? 0) + 1);
  }
}

/** Singleton instance used throughout the application. */
export const eventBus = new NeuronEventBus();
