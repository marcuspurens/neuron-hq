import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB module
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn(),
  getPool: vi.fn(),
}));

import { logKMRun, getLastAutoKMRunNumber, getKMRunHistory } from '../../src/aurora/km-log.js';
import { isDbAvailable, getPool } from '../../src/core/db.js';
import type { KMReport } from '../../src/core/agents/knowledge-manager.js';

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetPool = vi.mocked(getPool);

function makeMockReport(overrides?: Partial<KMReport>): KMReport {
  return {
    gapsFound: 3,
    gapsResearched: 2,
    gapsResolved: 1,
    urlsIngested: 4,
    factsLearned: 5,
    sourcesRefreshed: 1,
    newNodesCreated: 3,
    summary: 'Test summary',
    details: [],
    ...overrides,
  };
}

function createMockPool() {
  const mockQuery = vi.fn();
  mockGetPool.mockReturnValue({ query: mockQuery } as any);
  return mockQuery;
}

describe('km-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logKMRun()', () => {
    it('returns -1 when DB is not available', async () => {
      mockIsDbAvailable.mockResolvedValue(false);
      const result = await logKMRun({
        trigger: 'manual-cli',
        report: makeMockReport(),
        durationMs: 1000,
      });
      expect(result).toBe(-1);
    });

    it('inserts a row and returns the id', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [{ id: 42 }] });

      const result = await logKMRun({
        runId: 'run-123',
        runNumber: 5,
        trigger: 'auto',
        topic: 'quantum',
        report: makeMockReport(),
        durationMs: 2500,
      });

      expect(result).toBe(42);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO km_runs');
      expect(params).toEqual([
        'run-123', 5, 'auto', 'quantum',
        3, 2, 1, 4, 5, 1, 2500,
      ]);
    });

    it('passes null for optional fields when not provided', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });

      await logKMRun({
        trigger: 'manual-mcp',
        report: makeMockReport(),
        durationMs: 100,
      });

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBeNull(); // runId
      expect(params[1]).toBeNull(); // runNumber
      expect(params[3]).toBeNull(); // topic
    });
  });

  describe('getLastAutoKMRunNumber()', () => {
    it('returns null when DB is not available', async () => {
      mockIsDbAvailable.mockResolvedValue(false);
      const result = await getLastAutoKMRunNumber();
      expect(result).toBeNull();
    });

    it('returns null when no auto runs exist', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await getLastAutoKMRunNumber();
      expect(result).toBeNull();
    });

    it('returns the run_number of the latest auto run', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [{ run_number: 7 }] });

      const result = await getLastAutoKMRunNumber();
      expect(result).toBe(7);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("trigger = 'auto'");
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(sql).toContain('LIMIT 1');
    });
  });

  describe('getKMRunHistory()', () => {
    it('returns empty array when DB is not available', async () => {
      mockIsDbAvailable.mockResolvedValue(false);
      const result = await getKMRunHistory();
      expect(result).toEqual([]);
    });

    it('returns mapped entries with default limit 10', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      const now = new Date();
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 1, run_id: 'r1', run_number: 5, trigger: 'auto',
            topic: 'AI', gaps_found: 3, gaps_researched: 2,
            gaps_resolved: 1, urls_ingested: 4, facts_learned: 5,
            sources_refreshed: 1, duration_ms: 2000, created_at: now,
          },
        ],
      });

      const result = await getKMRunHistory();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 1,
        runId: 'r1',
        runNumber: 5,
        trigger: 'auto',
        topic: 'AI',
        gapsFound: 3,
        gapsResearched: 2,
        gapsResolved: 1,
        urlsIngested: 4,
        factsLearned: 5,
        sourcesRefreshed: 1,
        durationMs: 2000,
        createdAt: now,
      });

      // Check default limit
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([10]);
    });

    it('respects custom limit parameter', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [] });

      await getKMRunHistory(20);
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([20]);
    });

    it('queries with ORDER BY created_at DESC', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [] });

      await getKMRunHistory();
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at DESC');
    });
  });
});
