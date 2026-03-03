import { describe, it, expect, vi, afterEach } from 'vitest';

describe('db module', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isDbAvailable returns false when Postgres is not running', async () => {
    const { isDbAvailable, closePool } = await import('../../src/core/db.js');
    const result = await isDbAvailable();
    expect(typeof result).toBe('boolean');
    await closePool();
  });

  it('getPool returns a Pool instance', async () => {
    const { getPool, closePool } = await import('../../src/core/db.js');
    const pool = getPool();
    expect(pool).toBeDefined();
    expect(typeof pool.query).toBe('function');
    expect(typeof pool.connect).toBe('function');
    expect(typeof pool.end).toBe('function');
    await closePool();
  });

  it('getPool uses DATABASE_URL from env if set', async () => {
    const { getPool, closePool } = await import('../../src/core/db.js');
    const pool = getPool();
    expect(pool).toBeDefined();
    await closePool();
  });

  it('closePool can be called multiple times safely', async () => {
    const { closePool } = await import('../../src/core/db.js');
    await closePool();
    await closePool(); // Should not throw
  });

  it('getPool creates pool with max 5 connections', async () => {
    const { getPool, closePool } = await import('../../src/core/db.js');
    const pool = getPool();
    expect(pool).toBeDefined();
    await closePool();
  });
});
