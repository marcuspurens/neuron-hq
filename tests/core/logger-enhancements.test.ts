import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, setLogLevel, getLogLevel, setTraceId, getTraceId, setLogWriter, resetLogger } from '../../src/core/logger.js';
import type { LogWriter, LogEntry } from '../../src/core/logger.js';
import { resetConfig } from '../../src/core/config.js';

describe('logger enhancements', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    resetLogger();
    resetConfig();
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    resetLogger();
    resetConfig();
    delete process.env.LOG_LEVEL;
  });

  describe('LOG_LEVEL env var', () => {
    it('reads LOG_LEVEL from environment', () => {
      process.env.LOG_LEVEL = 'debug';
      resetConfig();
      resetLogger();
      const logger = createLogger('test');
      logger.debug('debug msg');
      expect(stderrSpy).toHaveBeenCalledOnce();
    });

    it('setLogLevel overrides env value', () => {
      process.env.LOG_LEVEL = 'debug';
      resetConfig();
      resetLogger();
      setLogLevel('error');
      const logger = createLogger('test');
      logger.debug('should not appear');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('defaults to info when LOG_LEVEL not set', () => {
      delete process.env.LOG_LEVEL;
      resetConfig();
      resetLogger();
      const logger = createLogger('test');
      logger.debug('should not appear');
      expect(stderrSpy).not.toHaveBeenCalled();
      logger.info('should appear');
      expect(stderrSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Error serialization', () => {
    it('serializes Error with name, message, stack', () => {
      const logger = createLogger('test');
      const err = new Error('boom');
      logger.error('fail', { error: err });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.error).toHaveProperty('name', 'Error');
      expect(parsed.error).toHaveProperty('message', 'boom');
      expect(parsed.error).toHaveProperty('stack');
      expect(typeof parsed.error.stack).toBe('string');
    });

    it('preserves custom Error properties', () => {
      const logger = createLogger('test');
      const err = new Error('fail') as Error & { code: string; statusCode: number };
      err.code = 'ENOENT';
      err.statusCode = 404;
      logger.error('fail', { error: err });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.error.code).toBe('ENOENT');
      expect(parsed.error.statusCode).toBe(404);
    });

    it('passes non-Error values through unchanged', () => {
      const logger = createLogger('test');
      logger.info('ok', { count: 42, name: 'test' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.count).toBe(42);
      expect(parsed.name).toBe('test');
    });
  });

  describe('traceId', () => {
    it('includes traceId in log entries after setTraceId', () => {
      setTraceId('run-123');
      const logger = createLogger('test');
      logger.info('hello');
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.traceId).toBe('run-123');
    });

    it('omits traceId when not set', () => {
      const logger = createLogger('test');
      logger.info('hello');
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed).not.toHaveProperty('traceId');
    });

    it('getTraceId returns current value', () => {
      expect(getTraceId()).toBeUndefined();
      setTraceId('abc');
      expect(getTraceId()).toBe('abc');
    });
  });

  describe('LogWriter', () => {
    it('custom LogWriter receives LogEntry objects', () => {
      const entries: LogEntry[] = [];
      const mockWriter: LogWriter = { write: (entry) => entries.push(entry) };
      setLogWriter(mockWriter);
      const logger = createLogger('test');
      logger.info('test msg', { foo: 'bar' });
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe('info');
      expect(entries[0].msg).toBe('test msg');
      expect(entries[0].module).toBe('test');
      expect((entries[0] as Record<string, unknown>).foo).toBe('bar');
    });

    it('default StderrWriter writes JSON to stderr', () => {
      // resetLogger restores default StderrWriter
      const logger = createLogger('test');
      logger.info('stderr test');
      expect(stderrSpy).toHaveBeenCalledOnce();
      const line = String(stderrSpy.mock.calls[0][0]);
      expect(line.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(line);
      expect(parsed.msg).toBe('stderr test');
    });

    it('setLogWriter changes destination', () => {
      const entries: LogEntry[] = [];
      const mockWriter: LogWriter = { write: (entry) => entries.push(entry) };
      setLogWriter(mockWriter);
      const logger = createLogger('test');
      logger.info('captured');
      expect(stderrSpy).not.toHaveBeenCalled(); // NOT written to stderr
      expect(entries).toHaveLength(1);
    });
  });
});
