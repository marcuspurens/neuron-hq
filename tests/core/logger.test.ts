import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, setLogLevel, getLogLevel } from '../../src/core/logger.js';

describe('logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setLogLevel('info'); // reset to default
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('createLogger', () => {
    it('returns object with debug/info/warn/error methods', () => {
      const logger = createLogger('test');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('sets the module field correctly', () => {
      const logger = createLogger('my-module');
      logger.info('hello');
      const output = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(output.module).toBe('my-module');
    });
  });

  describe('JSON format', () => {
    it('writes valid JSON to stderr', () => {
      const logger = createLogger('test');
      logger.info('test message');
      expect(stderrSpy).toHaveBeenCalledOnce();
      const line = String(stderrSpy.mock.calls[0][0]);
      expect(line.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(line);
      expect(parsed).toHaveProperty('ts');
      expect(parsed).toHaveProperty('level', 'info');
      expect(parsed).toHaveProperty('module', 'test');
      expect(parsed).toHaveProperty('msg', 'test message');
    });

    it('includes ISO timestamp', () => {
      const logger = createLogger('test');
      logger.info('ts test');
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(() => new Date(parsed.ts)).not.toThrow();
      expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('includes extra fields', () => {
      const logger = createLogger('test');
      logger.info('with extra', { count: 42, name: 'foo' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.count).toBe(42);
      expect(parsed.name).toBe('foo');
    });
  });

  describe('level filtering', () => {
    it('filters debug messages at info level', () => {
      setLogLevel('info');
      const logger = createLogger('test');
      logger.debug('should not appear');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('allows info messages at info level', () => {
      setLogLevel('info');
      const logger = createLogger('test');
      logger.info('should appear');
      expect(stderrSpy).toHaveBeenCalledOnce();
    });

    it('allows error messages at warn level', () => {
      setLogLevel('warn');
      const logger = createLogger('test');
      logger.error('should appear');
      expect(stderrSpy).toHaveBeenCalledOnce();
    });

    it('filters info messages at warn level', () => {
      setLogLevel('warn');
      const logger = createLogger('test');
      logger.info('should not appear');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('shows all messages at debug level', () => {
      setLogLevel('debug');
      const logger = createLogger('test');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(stderrSpy).toHaveBeenCalledTimes(4);
    });

    it('only shows error at error level', () => {
      setLogLevel('error');
      const logger = createLogger('test');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(stderrSpy).toHaveBeenCalledOnce();
    });
  });

  describe('redaction', () => {
    it('redacts fields matching "key"', () => {
      const logger = createLogger('test');
      logger.info('sensitive', { apiKey: 'abc123' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.apiKey).toBe('[REDACTED]');
    });

    it('redacts fields matching "token"', () => {
      const logger = createLogger('test');
      logger.info('sensitive', { accessToken: 'xyz' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.accessToken).toBe('[REDACTED]');
    });

    it('redacts fields matching "secret"', () => {
      const logger = createLogger('test');
      logger.info('sensitive', { clientSecret: 'secret123' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.clientSecret).toBe('[REDACTED]');
    });

    it('redacts fields matching "password"', () => {
      const logger = createLogger('test');
      logger.info('sensitive', { password: 'pass' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.password).toBe('[REDACTED]');
    });

    it('does not redact non-sensitive fields', () => {
      const logger = createLogger('test');
      logger.info('normal', { count: 5, name: 'test' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.count).toBe(5);
      expect(parsed.name).toBe('test');
    });

    it('is case-insensitive for sensitive patterns', () => {
      const logger = createLogger('test');
      logger.info('sensitive', { API_KEY: 'val', Token: 'val2' });
      const parsed = JSON.parse(String(stderrSpy.mock.calls[0][0]));
      expect(parsed.API_KEY).toBe('[REDACTED]');
      expect(parsed.Token).toBe('[REDACTED]');
    });
  });

  describe('setLogLevel / getLogLevel', () => {
    it('getLogLevel returns current level', () => {
      setLogLevel('warn');
      expect(getLogLevel()).toBe('warn');
    });

    it('defaults to info', () => {
      // reset happens in beforeEach
      expect(getLogLevel()).toBe('info');
    });
  });
});
