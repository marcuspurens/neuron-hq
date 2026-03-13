import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/core/run-statistics.js', () => ({
  getBeliefs: vi.fn(),
  getBeliefHistory: vi.fn(),
  getSummary: vi.fn(),
  backfillAllRuns: vi.fn(),
}));

vi.mock('../../src/cli.js', () => ({
  BASE_DIR: '/mock/base',
}));

import { neuronStatisticsCommand } from '../../src/commands/neuron-statistics.js';
import { getBeliefs, getBeliefHistory, getSummary, backfillAllRuns } from '../../src/core/run-statistics.js';

const mockGetBeliefs = getBeliefs as ReturnType<typeof vi.fn>;
const mockGetBeliefHistory = getBeliefHistory as ReturnType<typeof vi.fn>;
const mockGetSummary = getSummary as ReturnType<typeof vi.fn>;
const mockBackfillAllRuns = backfillAllRuns as ReturnType<typeof vi.fn>;

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.clearAllMocks();
});

afterEach(() => {
  consoleSpy.mockRestore();
});

describe('neuron:statistics command', () => {
  it('default display shows beliefs table', async () => {
    mockGetBeliefs.mockResolvedValue([
      { dimension: 'test-dim', confidence: 0.75, total_runs: 10, successes: 8 },
    ]);

    await neuronStatisticsCommand({});

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('test-dim');
  });

  it('empty beliefs shows help message', async () => {
    mockGetBeliefs.mockResolvedValue([]);

    await neuronStatisticsCommand({});

    const output = consoleSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('No run beliefs found');
  });

  it('--history flag shows dimension history', async () => {
    mockGetBeliefHistory.mockResolvedValue([
      {
        timestamp: '2026-01-01T00:00:00Z',
        old_confidence: 0.5,
        new_confidence: 0.6,
        success: true,
        weight: 1.0,
        evidence: 'test evidence',
      },
    ]);

    await neuronStatisticsCommand({ history: 'test-dim' });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('Confidence History');
  });

  it('--history with empty result shows No history', async () => {
    mockGetBeliefHistory.mockResolvedValue([]);

    await neuronStatisticsCommand({ history: 'unknown-dim' });

    const output = consoleSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('No history');
  });

  it('--summary flag shows summary sections', async () => {
    mockGetSummary.mockResolvedValue({
      strongest: [{ dimension: 'd1', confidence: 0.9, successes: 5, total_runs: 6 }],
      weakest: [],
      trending_up: [],
      trending_down: [],
    });

    await neuronStatisticsCommand({ summary: true });

    const output = consoleSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('Summary');
    expect(output).toContain('Strongest');
  });

  it('--backfill flag calls backfillAllRuns', async () => {
    mockBackfillAllRuns.mockResolvedValue({ processed: 10, dimensions: 5 });

    await neuronStatisticsCommand({ backfill: true });

    expect(mockBackfillAllRuns).toHaveBeenCalledWith(
      expect.stringContaining('/mock/base/runs'),
    );
    const output = consoleSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(output).toContain('Backfilled 10 runs');
  });

  it('--filter flag passes prefix to getBeliefs', async () => {
    mockGetBeliefs.mockResolvedValue([]);

    await neuronStatisticsCommand({ filter: 'test-prefix' });

    expect(mockGetBeliefs).toHaveBeenCalledWith({ prefix: 'test-prefix' });
  });
});
