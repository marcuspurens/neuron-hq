import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/core/run-statistics.js', () => ({
  getBeliefs: vi.fn(),
  getBeliefHistory: vi.fn(),
  getSummary: vi.fn(),
  detectContradictions: vi.fn(),
}));

vi.mock('../../src/cli.js', () => ({
  BASE_DIR: '/mock/base',
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { dashboardCommand, collectDashboardData } from '../../src/commands/dashboard.js';
import { getBeliefs, getBeliefHistory, getSummary, detectContradictions } from '../../src/core/run-statistics.js';
import fs from 'fs/promises';
import { exec } from 'child_process';

const mockGetBeliefs = getBeliefs as ReturnType<typeof vi.fn>;
const mockGetBeliefHistory = getBeliefHistory as ReturnType<typeof vi.fn>;
const mockGetSummary = getSummary as ReturnType<typeof vi.fn>;
const mockDetectContradictions = detectContradictions as ReturnType<typeof vi.fn>;

describe('dashboardCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBeliefs.mockResolvedValue([
      { dimension: 'test-dim', confidence: 0.7, total_runs: 5, successes: 4, last_updated: '2026-01-01' },
    ]);
    mockGetBeliefHistory.mockResolvedValue([]);
    mockGetSummary.mockResolvedValue({ strongest: [], weakest: [], trending_up: [], trending_down: [] });
    mockDetectContradictions.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes HTML file to runs/dashboard.html', async () => {
    await dashboardCommand({ open: false });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('runs/dashboard.html'),
      expect.stringContaining('<!DOCTYPE html>'),
      'utf-8',
    );
  });

  it('opens browser by default', async () => {
    await dashboardCommand({});

    expect(exec).toHaveBeenCalledWith(expect.stringContaining('open'));
  });

  it('--no-open skips browser', async () => {
    await dashboardCommand({ open: false });

    expect(exec).not.toHaveBeenCalled();
  });
});

describe('collectDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBeliefs.mockResolvedValue([
      { dimension: 'test-dim', confidence: 0.7, total_runs: 5, successes: 4, last_updated: '2026-01-01' },
    ]);
    mockGetBeliefHistory.mockResolvedValue([]);
    mockGetSummary.mockResolvedValue({ strongest: [], weakest: [], trending_up: [], trending_down: [] });
    mockDetectContradictions.mockReturnValue([]);
  });

  it('returns beliefs, summary, and historyMap', async () => {
    const data = await collectDashboardData();

    expect(data.beliefs).toHaveLength(1);
    expect(data.beliefs[0].dimension).toBe('test-dim');
    expect(data.summary).toEqual({ strongest: [], weakest: [], trending_up: [], trending_down: [] });
    expect(data.historyMap).toHaveProperty('test-dim');
  });

  it('fetches history for at most 10 dimensions', async () => {
    const beliefs = Array.from({ length: 15 }, (_, i) => ({
      dimension: `dim-${i}`,
      confidence: 0.9 - i * 0.01,
      total_runs: 5,
      successes: 4,
      last_updated: '2026-01-01',
    }));
    mockGetBeliefs.mockResolvedValue(beliefs);

    const data = await collectDashboardData();

    expect(mockGetBeliefHistory).toHaveBeenCalledTimes(10);
    expect(Object.keys(data.historyMap)).toHaveLength(10);
    expect(data.historyMap['dim-10']).toBeUndefined();
  });
});
