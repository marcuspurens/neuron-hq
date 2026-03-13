import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB module
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn(),
}));

// Mock run-statistics
vi.mock('../../src/core/run-statistics.js', () => ({
  getBeliefs: vi.fn(),
  getBeliefHistory: vi.fn(),
  getSummary: vi.fn(),
  detectContradictions: vi.fn(),
}));

// DO NOT mock pricing.ts - use real calcCost/getModelShortName/getModelLabel

import { collectDashboardData } from '../../src/commands/dashboard-data.js';
import { getPool, isDbAvailable } from '../../src/core/db.js';
import { getBeliefs, getBeliefHistory, getSummary, detectContradictions } from '../../src/core/run-statistics.js';
import { calcCost, getModelShortName } from '../../src/core/pricing.js';

const mockGetPool = getPool as ReturnType<typeof vi.fn>;
const mockIsDbAvailable = isDbAvailable as ReturnType<typeof vi.fn>;
const mockGetBeliefs = getBeliefs as ReturnType<typeof vi.fn>;
const mockGetBeliefHistory = getBeliefHistory as ReturnType<typeof vi.fn>;
const mockGetSummary = getSummary as ReturnType<typeof vi.fn>;
const mockDetectContradictions = detectContradictions as ReturnType<typeof vi.fn>;

const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

/** Default V1 mocks that return valid minimal data. */
function setupV1Defaults(): void {
  mockGetBeliefs.mockResolvedValue([
    { dimension: 'test-dim', confidence: 0.7, total_runs: 5, successes: 4, last_updated: '2026-01-01' },
  ]);
  mockGetBeliefHistory.mockResolvedValue([]);
  mockGetSummary.mockResolvedValue({
    strongest: [], weakest: [], trending_up: [], trending_down: [],
  });
  mockDetectContradictions.mockReturnValue([]);
}

/** Standard mock query handler returning sensible defaults for all V2 queries. */
function setupDefaultQueryHandler(overrides?: Record<string, unknown[]>): void {
  mockQuery.mockImplementation((sql: string) => {
    if (overrides) {
      for (const [pattern, rows] of Object.entries(overrides)) {
        if (sql.includes(pattern)) return { rows };
      }
    }
    if (sql.includes('GROUP BY status')) return { rows: [] };
    if (sql.includes('LEFT JOIN usage')) return { rows: [] };
    if (sql.includes('by_agent')) return { rows: [] };
    if (sql.includes('GROUP BY model')) return { rows: [] };
    if (sql.includes('kg_nodes')) return { rows: [{ count: 0 }] };
    if (sql.includes('aurora_nodes')) return { rows: [{ count: 0 }] };
    if (sql.includes('kg_edges')) return { rows: [{ count: 0 }] };
    if (sql.includes('aurora_edges')) return { rows: [{ count: 0 }] };
    if (sql.includes('ORDER BY r.started_at')) return { rows: [] };
    return { rows: [] };
  });
}

describe('collectDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockReturnValue(mockPool);
  });

  it('with mocked DB returns all fields', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();
    setupDefaultQueryHandler({
      'GROUP BY status': [{ status: 'GREEN', count: 5 }],
      'LEFT JOIN usage': [{
        runid: 'run-1', target_name: 'proj', status: 'GREEN',
        started_at: '2026-01-01', model: 'claude-sonnet-4-5-20250929',
        total_input_tokens: 1000, total_output_tokens: 500,
      }],
      'by_agent': [{
        runid: 'run-1', model: 'claude-sonnet-4-5-20250929',
        total_input_tokens: 1000, total_output_tokens: 500,
        by_agent: { manager: { input_tokens: 1000, output_tokens: 500 } },
      }],
      'GROUP BY model': [{
        model: 'claude-sonnet-4-5-20250929', runs: 5,
        total_input: 10000, total_output: 5000,
      }],
      'kg_nodes': [{ count: 100 }],
      'aurora_nodes': [{ count: 20 }],
      'kg_edges': [{ count: 50 }],
      'aurora_edges': [{ count: 10 }],
    });

    const result = await collectDashboardData();

    expect(result.beliefs).toHaveLength(1);
    expect(result.summary).toBeDefined();
    expect(result.historyMap).toHaveProperty('test-dim');
    expect(result.contradictions).toEqual([]);
    expect(result.rawBeliefs).toHaveLength(1);
    expect(result.runOverview.totalRuns).toBe(5);
    expect(result.tokenUsage.totalInputTokens).toBe(1000);
    expect(result.modelBreakdown).toHaveLength(1);
    expect(result.knowledgeStats.neuronNodes).toBe(100);
    expect(result.knowledgeStats.auroraNodes).toBe(20);
    expect(result.knowledgeStats.neuronEdges).toBe(50);
    expect(result.knowledgeStats.auroraEdges).toBe(10);
  });

  it('without DB — all v2 fields are zero/empty', async () => {
    mockIsDbAvailable.mockResolvedValue(false);
    setupV1Defaults();

    const result = await collectDashboardData();

    // V1 data should still be present
    expect(result.beliefs).toHaveLength(1);

    // V2 data should be empty/zero
    expect(result.runOverview.totalRuns).toBe(0);
    expect(result.runOverview.greenCount).toBe(0);
    expect(result.runOverview.recentRuns).toEqual([]);
    expect(result.tokenUsage.totalCostUsd).toBe(0);
    expect(result.tokenUsage.totalInputTokens).toBe(0);
    expect(result.tokenUsage.byAgent).toEqual({});
    expect(result.modelBreakdown).toEqual([]);
    expect(result.knowledgeStats.neuronNodes).toBe(0);
    expect(result.knowledgeStats.auroraNodes).toBe(0);
  });

  it('RunOverview status counts are correct', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();
    setupDefaultQueryHandler({
      'GROUP BY status': [
        { status: 'GREEN', count: 10 },
        { status: 'YELLOW', count: 3 },
        { status: 'RED', count: 1 },
        { status: null, count: 2 },
      ],
    });

    const result = await collectDashboardData();

    expect(result.runOverview.greenCount).toBe(10);
    expect(result.runOverview.yellowCount).toBe(3);
    expect(result.runOverview.redCount).toBe(1);
    expect(result.runOverview.unknownCount).toBe(2);
    expect(result.runOverview.totalRuns).toBe(16);
  });

  it('cost calculation uses calcCost correctly', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();

    const model = 'claude-sonnet-4-5-20250929';
    const inputTokens = 500_000;
    const outputTokens = 100_000;

    setupDefaultQueryHandler({
      'by_agent': [{
        runid: 'run-1', model, total_input_tokens: inputTokens,
        total_output_tokens: outputTokens, by_agent: null,
      }],
    });

    const result = await collectDashboardData();

    const expectedCost = calcCost(inputTokens, outputTokens, getModelShortName(model));
    expect(result.tokenUsage.totalCostUsd).toBe(expectedCost);
    expect(expectedCost).toBeGreaterThan(0);
  });

  it('by_agent JSON aggregation with empty + non-empty data', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();

    setupDefaultQueryHandler({
      'by_agent': [
        {
          runid: 'run-1', model: 'claude-sonnet-4-5-20250929',
          total_input_tokens: 1000, total_output_tokens: 500,
          by_agent: { manager: { input_tokens: 100, output_tokens: 50 } },
        },
        {
          runid: 'run-2', model: 'claude-sonnet-4-5-20250929',
          total_input_tokens: 2000, total_output_tokens: 1000,
          by_agent: {
            manager: { input_tokens: 200, output_tokens: 100 },
            implementer: { input_tokens: 500, output_tokens: 200 },
          },
        },
      ],
    });

    const result = await collectDashboardData();

    expect(result.tokenUsage.byAgent.manager.input).toBe(300);
    expect(result.tokenUsage.byAgent.manager.output).toBe(150);
    expect(result.tokenUsage.byAgent.implementer.input).toBe(500);
    expect(result.tokenUsage.byAgent.implementer.output).toBe(200);
  });

  it('ModelBreakdown computed correctly', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();

    setupDefaultQueryHandler({
      'GROUP BY model': [{
        model: 'claude-sonnet-4-5-20250929', runs: 5,
        total_input: 1_000_000, total_output: 500_000,
      }],
    });

    const result = await collectDashboardData();

    expect(result.modelBreakdown).toHaveLength(1);
    const mb = result.modelBreakdown[0];
    expect(mb.label).toBe('Sonnet 4.5');
    expect(mb.runs).toBe(5);
    expect(mb.totalInputTokens).toBe(1_000_000);
    expect(mb.totalOutputTokens).toBe(500_000);

    const expectedCost = calcCost(1_000_000, 500_000, getModelShortName('claude-sonnet-4-5-20250929'));
    expect(mb.totalCostUsd).toBe(expectedCost);
    expect(mb.avgCostPerRun).toBe(expectedCost / 5);
  });

  it('KnowledgeStats counts correctly', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();

    setupDefaultQueryHandler({
      'kg_nodes': [{ count: 268 }],
      'aurora_nodes': [{ count: 27 }],
      'kg_edges': [{ count: 150 }],
      'aurora_edges': [{ count: 30 }],
    });

    const result = await collectDashboardData();

    expect(result.knowledgeStats.neuronNodes).toBe(268);
    expect(result.knowledgeStats.auroraNodes).toBe(27);
    expect(result.knowledgeStats.neuronEdges).toBe(150);
    expect(result.knowledgeStats.auroraEdges).toBe(30);
  });

  it('V1 data failure does not break v2', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockGetBeliefs.mockRejectedValue(new Error('DB connection failed'));
    mockGetSummary.mockRejectedValue(new Error('DB connection failed'));
    mockGetBeliefHistory.mockResolvedValue([]);

    setupDefaultQueryHandler({
      'GROUP BY status': [{ status: 'GREEN', count: 7 }],
      'kg_nodes': [{ count: 42 }],
      'aurora_nodes': [{ count: 5 }],
      'kg_edges': [{ count: 20 }],
      'aurora_edges': [{ count: 3 }],
    });

    const result = await collectDashboardData();

    // V1 should be empty due to error
    expect(result.beliefs).toEqual([]);
    expect(result.contradictions).toEqual([]);
    expect(result.rawBeliefs).toEqual([]);
    // V2 should still work
    expect(result.runOverview.greenCount).toBe(7);
    expect(result.runOverview.totalRuns).toBe(7);
    expect(result.knowledgeStats.neuronNodes).toBe(42);
  });

  it('recentRuns handles null model/tokens gracefully', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();

    setupDefaultQueryHandler({
      'LEFT JOIN usage': [{
        runid: 'run-null', target_name: 'proj', status: 'GREEN',
        started_at: '2026-01-01', model: null,
        total_input_tokens: null, total_output_tokens: null,
      }],
    });

    const result = await collectDashboardData();

    expect(result.runOverview.recentRuns).toHaveLength(1);
    const run = result.runOverview.recentRuns[0];
    expect(run.model).toBe('');
    expect(run.inputTokens).toBe(0);
    expect(run.outputTokens).toBe(0);
    expect(run.costUsd).toBe(0);
  });

  it('recentTokenTrend has correct structure', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();

    setupDefaultQueryHandler({
      'ORDER BY r.started_at': [
        { runid: 'run-1', total_input_tokens: 5000, total_output_tokens: 2000, model: 'claude-sonnet-4-5-20250929' },
        { runid: 'run-2', total_input_tokens: 8000, total_output_tokens: 3000, model: 'claude-sonnet-4-5-20250929' },
      ],
    });

    const result = await collectDashboardData();

    expect(result.tokenUsage.recentTokenTrend).toHaveLength(2);
    const [t1, t2] = result.tokenUsage.recentTokenTrend;
    expect(t1.runid).toBe('run-1');
    expect(t1.tokens).toBe(7000);
    expect(t1.cost).toBe(calcCost(5000, 2000, 'sonnet'));
    expect(t2.runid).toBe('run-2');
    expect(t2.tokens).toBe(11000);
    expect(t2.cost).toBe(calcCost(8000, 3000, 'sonnet'));
  });

  it('contradictions are passed through from detectContradictions', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();
    const fakeContradiction = {
      dimension1: 'agent:implementer',
      dimension2: 'agent:reviewer',
      confidence1: 0.9,
      confidence2: 0.4,
      gap: 0.5,
      description: 'test contradiction',
    };
    mockDetectContradictions.mockReturnValue([fakeContradiction]);
    setupDefaultQueryHandler();

    const result = await collectDashboardData();

    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0]).toEqual(fakeContradiction);
  });

  it('getBeliefs called twice: with decay (default) and without decay', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    setupV1Defaults();
    setupDefaultQueryHandler();

    await collectDashboardData();

    // First call: default (with decay), second call: applyDecay: false
    expect(mockGetBeliefs).toHaveBeenCalledTimes(2);
    expect(mockGetBeliefs).toHaveBeenNthCalledWith(1);
    expect(mockGetBeliefs).toHaveBeenNthCalledWith(2, { applyDecay: false });
  });
});
