import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig, resetConfig } from '../../src/core/config.js';

describe('config', () => {
  /** Save and restore env vars that we override in tests. */
  const saved: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string | undefined): void {
    if (!(key in saved)) saved[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    // Restore all modified env vars
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    // Clear saved
    for (const key of Object.keys(saved)) delete saved[key];
    resetConfig();
  });

  it('getConfig() returns correct defaults when env vars are unset', () => {
    // Ensure relevant vars are unset
    setEnv('OLLAMA_URL', undefined);
    setEnv('OLLAMA_MODEL_EMBED', undefined);
    setEnv('OLLAMA_MODEL_VISION', undefined);
    setEnv('OLLAMA_MODEL_POLISH', undefined);
    setEnv('AURORA_PYTHON_PATH', undefined);
    setEnv('LANGFUSE_BASE_URL', undefined);
    setEnv('DB_POOL_MAX', undefined);
    resetConfig();

    const config = getConfig();
    expect(config.OLLAMA_URL).toBe('http://localhost:11434');
    expect(config.OLLAMA_MODEL_EMBED).toBe('snowflake-arctic-embed');
    expect(config.OLLAMA_MODEL_VISION).toBe('aurora-vision-extract');
    expect(config.OLLAMA_MODEL_POLISH).toBe('gemma3');
    expect(config.AURORA_PYTHON_PATH).toBe('python3');
    expect(config.LANGFUSE_BASE_URL).toBe('http://localhost:3000');
    expect(config.DB_POOL_MAX).toBe(5);
  });

  it('getConfig() returns undefined for truly optional fields when not set', () => {
    setEnv('PYANNOTE_TOKEN', undefined);
    setEnv('LANGFUSE_PUBLIC_KEY', undefined);
    setEnv('LANGFUSE_SECRET_KEY', undefined);
    setEnv('LANGFUSE_ENABLED', undefined);
    resetConfig();

    const config = getConfig();
    expect(config.PYANNOTE_TOKEN).toBeUndefined();
    expect(config.LANGFUSE_PUBLIC_KEY).toBeUndefined();
    expect(config.LANGFUSE_SECRET_KEY).toBeUndefined();
    expect(config.LANGFUSE_ENABLED).toBeUndefined();
  });

  it('getConfig() caches result (returns same object on second call)', () => {
    const first = getConfig();
    const second = getConfig();
    expect(first).toBe(second); // strict reference equality
  });

  it('resetConfig() clears cache so next call re-parses', () => {
    const first = getConfig();
    resetConfig();
    const second = getConfig();
    // After reset, a new object is created (not the same reference)
    expect(first).not.toBe(second);
    // But values should be equivalent
    expect(first.OLLAMA_URL).toBe(second.OLLAMA_URL);
  });

  it('DB_POOL_MAX coerces string to number', () => {
    setEnv('DB_POOL_MAX', '10');
    resetConfig();

    const config = getConfig();
    expect(config.DB_POOL_MAX).toBe(10);
    expect(typeof config.DB_POOL_MAX).toBe('number');
  });

  it('DB_POOL_MAX defaults to 5 when not set', () => {
    setEnv('DB_POOL_MAX', undefined);
    resetConfig();

    const config = getConfig();
    expect(config.DB_POOL_MAX).toBe(5);
  });

  it('reads DATABASE_URL from environment', () => {
    // vitest.config.ts sets DATABASE_URL to a disabled value
    const config = getConfig();
    expect(config.DATABASE_URL).toBe('postgresql://localhost:1/disabled');
  });

  it('reads custom OLLAMA_URL when set', () => {
    setEnv('OLLAMA_URL', 'http://custom:9999');
    resetConfig();

    const config = getConfig();
    expect(config.OLLAMA_URL).toBe('http://custom:9999');
  });

  it('reads custom OLLAMA_MODEL_EMBED when set', () => {
    setEnv('OLLAMA_MODEL_EMBED', 'my-embed-model');
    resetConfig();

    const config = getConfig();
    expect(config.OLLAMA_MODEL_EMBED).toBe('my-embed-model');
  });
});
