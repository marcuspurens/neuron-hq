import { getConfig } from './config.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string; // ISO timestamp
  level: LogLevel;
  module: string; // e.g. 'manager', 'ollama', 'aurora:intake'
  msg: string;
  [key: string]: unknown; // extra context
}

export interface LogWriter {
  write(entry: LogEntry): void;
}

class StderrWriter implements LogWriter {
  write(entry: LogEntry): void {
    process.stderr.write(JSON.stringify(entry) + '\n');
  }
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const SENSITIVE_PATTERN = /key|token|secret|password/i;

let minLevel: LogLevel = 'info';
let initialized = false;
let traceId: string | undefined;
let writer: LogWriter = new StderrWriter();

/**
 * Lazily initialize log level from config on first log call.
 */
function ensureInit(): void {
  if (!initialized) {
    try {
      const cfg = getConfig();
      minLevel = cfg.LOG_LEVEL;
    } catch {
      // Config not available, keep default 'info'
    }
    initialized = true;
  }
}

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
  initialized = true;
}

export function getLogLevel(): LogLevel {
  return minLevel;
}

/**
 * Set the trace ID included in all subsequent log entries.
 */
export function setTraceId(id: string): void {
  traceId = id;
}

/**
 * Get the current trace ID, if any.
 */
export function getTraceId(): string | undefined {
  return traceId;
}

/**
 * Replace the default stderr LogWriter with a custom implementation.
 */
export function setLogWriter(w: LogWriter): void {
  writer = w;
}

/**
 * Reset all logger state to defaults. Useful for testing.
 */
export function resetLogger(): void {
  minLevel = 'info';
  initialized = false;
  traceId = undefined;
  writer = new StderrWriter();
}

function serializeExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v instanceof Error) {
      const errRecord = v as unknown as Record<string, unknown>;
      result[k] = {
        name: v.name,
        message: v.message,
        stack: v.stack,
        ...Object.getOwnPropertyNames(v).reduce((acc, prop) => {
          if (!['name', 'message', 'stack'].includes(prop)) {
            acc[prop] = errRecord[prop];
          }
          return acc;
        }, {} as Record<string, unknown>),
      };
    } else {
      result[k] = v;
    }
  }
  return result;
}

function redact(extra: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    result[k] = SENSITIVE_PATTERN.test(k) ? '[REDACTED]' : v;
  }
  return result;
}

export function createLogger(module: string) {
  const log = (level: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    ensureInit();
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      module,
      msg,
      ...(traceId ? { traceId } : {}),
      ...(extra ? redact(serializeExtra(extra)) : {}),
    };
    writer.write(entry);
  };

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
  };
}
