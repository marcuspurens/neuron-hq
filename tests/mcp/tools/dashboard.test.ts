import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/core/run-statistics.js', () => ({
  getBeliefs: vi.fn(),
  getBeliefHistory: vi.fn(),
  getSummary: vi.fn(),
}));

vi.mock('../../../src/cli.js', () => ({
  BASE_DIR: '/mock/base',
}));

import { getBeliefs, getBeliefHistory, getSummary } from '../../../src/core/run-statistics.js';
import { collectDashboardData } from '../../../src/commands/dashboard.js';
import { renderDashboard } from '../../../src/commands/dashboard-template.js';

beforeEach(() => {
  vi.clearAllMocks();
  (getBeliefs as ReturnType<typeof vi.fn>).mockResolvedValue([
    { dimension: 'mcp-dim', confidence: 0.8, total_runs: 3, successes: 2, last_updated: '2026-01-01' },
  ]);
  (getBeliefHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
    strongest: [],
    weakest: [],
    trending_up: [],
    trending_down: [],
  });
});

describe('MCP dashboard tool integration', () => {
  it('collectDashboardData + renderDashboard returns HTML', async () => {
    const data = await collectDashboardData();
    const html = renderDashboard(data);

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('mcp-dim');
  });

  it('returns valid dashboard HTML with all sections', async () => {
    const data = await collectDashboardData();
    const html = renderDashboard(data);

    expect(html).toContain('belief-table');
    expect(html).toContain('confidence-chart');
    expect(html).toContain('Statistics Dashboard');
  });
});
