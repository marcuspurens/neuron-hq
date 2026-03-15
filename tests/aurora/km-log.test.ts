import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB module
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn(),
  getPool: vi.fn(),
}));

import { logKMRun, getLastAutoKMRunNumber, getKMRunHistory, getChainStatus } from '../../src/aurora/km-log.js';
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
        null, null, null,
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
      expect(params[11]).toBeNull(); // chainId
      expect(params[12]).toBeNull(); // cycleNumber
      expect(params[13]).toBeNull(); // stoppedBy
    });

    it('includes chain tracking fields in INSERT when provided', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [{ id: 99 }] });

      const result = await logKMRun({
        runId: 'run-456',
        trigger: 'auto',
        report: makeMockReport(),
        durationMs: 3000,
        chainId: 'chain-abc',
        cycleNumber: 2,
        stoppedBy: 'convergence',
      });

      expect(result).toBe(99);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('chain_id');
      expect(sql).toContain('cycle_number');
      expect(sql).toContain('stopped_by');
      expect(params[11]).toBe('chain-abc');
      expect(params[12]).toBe(2);
      expect(params[13]).toBe('convergence');
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
            sources_refreshed: 1, duration_ms: 2000,
            chain_id: 'chain-x', cycle_number: 1, stopped_by: null,
            created_at: now,
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
        chainId: 'chain-x',
        cycleNumber: 1,
        stoppedBy: null,
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

    it('includes chain_id, cycle_number, stopped_by in SELECT', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [] });

      await getKMRunHistory();
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain('chain_id');
      expect(sql).toContain('cycle_number');
      expect(sql).toContain('stopped_by');
    });
  });

  describe('getChainStatus()', () => {
    it('returns empty array when DB is not available', async () => {
      mockIsDbAvailable.mockResolvedValue(false);
      const result = await getChainStatus('chain-123');
      expect(result).toEqual([]);
    });

    it('returns mapped chain status entries ordered by cycle_number', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      const now = new Date();
      const later = new Date(now.getTime() + 60000);
      mockQuery.mockResolvedValue({
        rows: [
          {
            cycle_number: 1, gaps_found: 5, gaps_researched: 3,
            gaps_resolved: 2, stopped_by: null, created_at: now,
          },
          {
            cycle_number: 2, gaps_found: 2, gaps_researched: 2,
            gaps_resolved: 2, stopped_by: 'convergence', created_at: later,
          },
        ],
      });

      const result = await getChainStatus('chain-abc');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        cycleNumber: 1,
        gapsFound: 5,
        gapsResearched: 3,
        gapsResolved: 2,
        stoppedBy: null,
        createdAt: now,
      });
      expect(result[1]).toEqual({
        cycleNumber: 2,
        gapsFound: 2,
        gapsResearched: 2,
        gapsResolved: 2,
        stoppedBy: 'convergence',
        createdAt: later,
      });

      // Verify query params
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('chain_id = $1');
      expect(sql).toContain('ORDER BY cycle_number');
      expect(params).toEqual(['chain-abc']);
    });

    it('queries km_runs table with chain_id filter', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [] });

      await getChainStatus('test-chain');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM km_runs');
      expect(sql).toContain('WHERE chain_id = $1');
      expect(params).toEqual(['test-chain']);
    });
  });

  describe('logKMRun() — chain context', () => {
    it('logKMRun accepts additional chain metadata in report', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [{ id: 99 }] });

      const report = makeMockReport({
        chainId: 'chain-abc-123',
        cycleNumber: 2,
        totalCycles: 3,
        stoppedBy: 'convergence',
        emergentGapsFound: 5,
      } as Partial<KMReport>);

      const result = await logKMRun({
        runId: 'run-chain-1',
        runNumber: 10,
        trigger: 'auto',
        topic: 'quantum',
        report,
        durationMs: 5000,
      });

      expect(result).toBe(99);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      // Verify the standard fields are still passed correctly
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO km_runs');
      expect(params[0]).toBe('run-chain-1');
      expect(params[2]).toBe('auto');
    });

    it('logKMRun works with chain report that has stoppedBy timeout', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [{ id: 100 }] });

      const report = makeMockReport({
        chainId: 'chain-timeout-1',
        stoppedBy: 'timeout',
        totalCycles: 1,
        emergentGapsFound: 0,
      } as Partial<KMReport>);

      const result = await logKMRun({
        trigger: 'manual-cli',
        report,
        durationMs: 900000,
      });

      expect(result).toBe(100);
    });

    it('logKMRun handles report with noNewGaps stoppedBy', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      mockQuery.mockResolvedValue({ rows: [{ id: 101 }] });

      const report = makeMockReport({
        stoppedBy: 'noNewGaps',
      } as Partial<KMReport>);

      const result = await logKMRun({
        trigger: 'manual-mcp',
        report,
        durationMs: 1000,
      });

      expect(result).toBe(101);
    });
  });

  describe('getKMRunHistory() — chain fields', () => {
    it('getKMRunHistory returns entries with chain-compatible fields', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      const now = new Date();
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 10, run_id: 'r-chain-1', run_number: 15, trigger: 'auto',
            topic: 'AI chains', gaps_found: 5, gaps_researched: 4,
            gaps_resolved: 3, urls_ingested: 8, facts_learned: 10,
            sources_refreshed: 2, duration_ms: 45000, created_at: now,
          },
          {
            id: 11, run_id: 'r-chain-1', run_number: 16, trigger: 'auto',
            topic: 'AI chains', gaps_found: 3, gaps_researched: 2,
            gaps_resolved: 1, urls_ingested: 4, facts_learned: 5,
            sources_refreshed: 1, duration_ms: 30000, created_at: now,
          },
        ],
      });

      const result = await getKMRunHistory(5);

      expect(result).toHaveLength(2);
      expect(result[0].runId).toBe('r-chain-1');
      expect(result[0].gapsFound).toBe(5);
      expect(result[0].durationMs).toBe(45000);
      expect(result[1].gapsResearched).toBe(2);
    });

    it('getKMRunHistory entries can be filtered by shared runId for chain grouping', async () => {
      mockIsDbAvailable.mockResolvedValue(true);
      const mockQuery = createMockPool();
      const now = new Date();
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 20, run_id: 'chain-group-1', run_number: 1, trigger: 'auto',
            topic: null, gaps_found: 2, gaps_researched: 1,
            gaps_resolved: 1, urls_ingested: 2, facts_learned: 3,
            sources_refreshed: 0, duration_ms: 10000, created_at: now,
          },
        ],
      });

      const result = await getKMRunHistory();
      const chainEntries = result.filter((e) => e.runId === 'chain-group-1');

      expect(chainEntries).toHaveLength(1);
      expect(chainEntries[0].trigger).toBe('auto');
    });
  });
});
