import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB
const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import {
  calculateFreshnessScore,
  freshnessStatus,
  verifySource,
  getFreshnessReport,
} from '../../src/aurora/freshness.js';

describe('calculateFreshnessScore()', () => {
  it('returns 0 for null (never verified)', () => {
    expect(calculateFreshnessScore(null)).toBe(0);
  });

  it('returns 1.0 for verified just now', () => {
    expect(calculateFreshnessScore(new Date())).toBe(1);
  });

  it('returns ~0.5 for 45 days ago', () => {
    const d = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    expect(calculateFreshnessScore(d)).toBe(0.5);
  });

  it('returns 0 for 90+ days ago', () => {
    const d = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    expect(calculateFreshnessScore(d)).toBe(0);
  });

  it('returns 0 for exactly 90 days ago', () => {
    const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    expect(calculateFreshnessScore(d)).toBe(0);
  });

  it('respects custom maxAgeDays', () => {
    const d = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    expect(calculateFreshnessScore(d, 30)).toBe(0.5);
  });
});

describe('freshnessStatus()', () => {
  it('returns unverified when lastVerified is null', () => {
    expect(freshnessStatus(0, null)).toBe('unverified');
  });

  it('returns fresh for score >= 0.7', () => {
    expect(freshnessStatus(0.7, new Date())).toBe('fresh');
    expect(freshnessStatus(1.0, new Date())).toBe('fresh');
  });

  it('returns aging for score >= 0.3 and < 0.7', () => {
    expect(freshnessStatus(0.3, new Date())).toBe('aging');
    expect(freshnessStatus(0.5, new Date())).toBe('aging');
  });

  it('returns stale for score < 0.3', () => {
    expect(freshnessStatus(0.1, new Date())).toBe('stale');
    expect(freshnessStatus(0.0, new Date())).toBe('stale');
  });
});

describe('verifySource()', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns true when node found and updated', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await verifySource('node-1');
    expect(result).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE aurora_nodes SET last_verified = NOW() WHERE id = $1',
      ['node-1'],
    );
  });

  it('returns false for unknown nodeId', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const result = await verifySource('unknown-id');
    expect(result).toBe(false);
  });
});

describe('getFreshnessReport()', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('returns sorted list with freshness info', async () => {
    const now = new Date().toISOString();
    mockQuery.mockResolvedValue({
      rows: [
        { id: 'n1', title: 'Node 1', type: 'fact', confidence: 0.8, last_verified: null, days_since: null },
        { id: 'n2', title: 'Node 2', type: 'document', confidence: 0.9, last_verified: now, days_since: 0 },
      ],
    });

    const report = await getFreshnessReport();

    expect(report).toHaveLength(2);
    expect(report[0].nodeId).toBe('n1');
    expect(report[0].status).toBe('unverified');
    expect(report[0].freshnessScore).toBe(0);
    expect(report[1].nodeId).toBe('n2');
    expect(report[1].status).toBe('fresh');
    expect(report[1].freshnessScore).toBe(1);
  });

  it('filters to only stale when onlyStale is true', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await getFreshnessReport({ onlyStale: true });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('last_verified IS NULL'),
      [20],
    );
  });

  it('respects limit option', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await getFreshnessReport({ limit: 5 });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      [5],
    );
  });
});
