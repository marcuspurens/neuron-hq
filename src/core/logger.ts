export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string; // ISO timestamp
  level: LogLevel;
  module: string; // e.g. 'manager', 'ollama', 'aurora:intake'
  msg: string;
  [key: string]: unknown; // extra context
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const SENSITIVE_PATTERN = /key|token|secret|password/i;

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function getLogLevel(): LogLevel {
  return minLevel;
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
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      module,
      msg,
      ...(extra ? redact(extra) : {}),
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  };

  return {
    debug: (msg: string, extra?: Record<string, unknown>) => log('debug', msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
  };
}
