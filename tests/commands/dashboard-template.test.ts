import { describe, it, expect } from 'vitest';
import { renderDashboard } from '../../src/commands/dashboard-template.js';
import type { DashboardData } from '../../src/commands/dashboard-template.js';

const sampleData: DashboardData = {
  beliefs: [
    { dimension: 'agent:implementer', confidence: 0.85, total_runs: 20, successes: 17, last_updated: '2026-03-13T00:00:00Z' },
    { dimension: 'agent:reviewer', confidence: 0.45, total_runs: 15, successes: 7, last_updated: '2026-03-13T00:00:00Z' },
    { dimension: 'brief:feature', confidence: 0.30, total_runs: 10, successes: 3, last_updated: '2026-03-12T00:00:00Z' },
  ],
  summary: {
    strongest: [{ dimension: 'agent:implementer', confidence: 0.85, total_runs: 20, successes: 17, last_updated: '2026-03-13T00:00:00Z' }],
    weakest: [{ dimension: 'brief:feature', confidence: 0.30, total_runs: 10, successes: 3, last_updated: '2026-03-12T00:00:00Z' }],
    trending_up: [],
    trending_down: [],
  },
  historyMap: {
    'agent:implementer': [
      { id: 1, dimension: 'agent:implementer', runid: 'run-1', old_confidence: 0.5, new_confidence: 0.6, success: true, weight: 0.2, evidence: 'test', timestamp: '2026-03-12T00:00:00Z' },
      { id: 2, dimension: 'agent:implementer', runid: 'run-2', old_confidence: 0.6, new_confidence: 0.85, success: true, weight: 0.2, evidence: 'test2', timestamp: '2026-03-13T00:00:00Z' },
    ],
  },
  runOverview: {
    totalRuns: 25,
    greenCount: 18,
    yellowCount: 4,
    redCount: 2,
    unknownCount: 1,
    recentRuns: [
      { runid: 'run-001', target: 'neuron-hq', status: 'GREEN', model: 'claude-sonnet-4-5-20250929', date: '2026-03-13T08:00:00Z', inputTokens: 150000, outputTokens: 50000, costUsd: 1.20 },
      { runid: 'run-002', target: 'aurora', status: 'RED', model: 'claude-haiku-4-5-20251001', date: '2026-03-12T14:00:00Z', inputTokens: 80000, outputTokens: 30000, costUsd: 0.18 },
    ],
  },
  tokenUsage: {
    totalInputTokens: 5000000,
    totalOutputTokens: 2000000,
    totalCostUsd: 45.00,
    byAgent: {
      manager: { input: 1500000, output: 600000, cost: 13.50 },
      implementer: { input: 2500000, output: 1000000, cost: 22.50 },
      reviewer: { input: 1000000, output: 400000, cost: 9.00 },
    },
    recentTokenTrend: [
      { runid: 'run-001', tokens: 200000, cost: 1.20 },
    ],
  },
  modelBreakdown: [
    { model: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', runs: 20, totalInputTokens: 4000000, totalOutputTokens: 1600000, totalCostUsd: 36.00, avgCostPerRun: 1.80 },
    { model: 'claude-haiku-4-5-20251001', label: 'Haiku', runs: 5, totalInputTokens: 1000000, totalOutputTokens: 400000, totalCostUsd: 2.40, avgCostPerRun: 0.48 },
  ],
  knowledgeStats: {
    neuronNodes: 268,
    auroraNodes: 27,
    neuronEdges: 150,
    auroraEdges: 30,
  },
};

const emptyV2Data: DashboardData = {
  beliefs: [],
  summary: { strongest: [], weakest: [], trending_up: [], trending_down: [] },
  historyMap: {},
  runOverview: { totalRuns: 0, greenCount: 0, yellowCount: 0, redCount: 0, unknownCount: 0, recentRuns: [] },
  tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0, byAgent: {}, recentTokenTrend: [] },
  modelBreakdown: [],
  knowledgeStats: { neuronNodes: 0, auroraNodes: 0, neuronEdges: 0, auroraEdges: 0 },
};

describe('renderDashboard', () => {
  it('renders valid HTML with empty data', () => {
    const emptyData: DashboardData = {
      beliefs: [],
      summary: { strongest: [], weakest: [], trending_up: [], trending_down: [] },
      historyMap: {},
      runOverview: { totalRuns: 0, greenCount: 0, yellowCount: 0, redCount: 0, unknownCount: 0, recentRuns: [] },
      tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0, byAgent: {}, recentTokenTrend: [] },
      modelBreakdown: [],
      knowledgeStats: { neuronNodes: 0, auroraNodes: 0, neuronEdges: 0, auroraEdges: 0 },
    };
    const html = renderDashboard(emptyData);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html.toLowerCase()).toContain('no data');
  });

  it('renders dimension names from beliefs', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('agent:implementer');
  });

  it('renders confidence values', () => {
    const html = renderDashboard(sampleData);
    // The template may show 0.85 as a decimal or as 85%
    const has085 = html.includes('0.85') || html.includes('0.8500');
    const has85pct = html.includes('85');
    expect(has085 || has85pct).toBe(true);
  });

  it('contains search/filter input field', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('belief-filter');
  });

  it('contains Chart.js CDN script', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('cdn.jsdelivr.net/npm/chart.js');
  });

  it('summary cards show correct total dimensions count', () => {
    const html = renderDashboard(sampleData);
    // 3 beliefs → card should show 3
    expect(html).toContain('>3<');
  });

  it('confidence colors: green for high, red for low', () => {
    const html = renderDashboard(sampleData);
    // 0.85 → green (#22c55e), 0.30 → red (#ef4444)
    expect(html).toContain('#22c55e');
    expect(html).toContain('#ef4444');
  });

  it('renders trend sections with emoji headers', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('🏆');
    expect(html).toContain('⚠️');
    expect(html).toContain('📈');
    expect(html).toContain('📉');
  });

  it('renders history chart data', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('confidence-chart');
  });

  it('weak dimensions count is correct', () => {
    // sampleData has 2 beliefs with confidence < 0.5 (0.45 and 0.30)
    // and 1 with confidence > 0.5 (0.85)
    const html = renderDashboard(sampleData);
    // Weak Dimensions card should show 2
    const cardsSection = html.substring(
      html.indexOf('class="cards"'),
      html.indexOf('class="section"'),
    );
    expect(cardsSection).toContain('>2<');
    expect(cardsSection).toContain('Weak Dimensions');
  });

  // --- V2 tests ---

  it('renders run overview with status colors', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('GREEN');
    expect(html).toContain('RED');
    expect(html).toContain('run-001');
    expect(html).toContain('neuron-hq');
  });

  it('model table shows labels not raw model names', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('Sonnet 4.5');
    expect(html).toContain('Haiku');
  });

  it('renders doughnut chart for agent tokens', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('agent-token-chart');
    expect(html).toContain('doughnut');
  });

  it('cost displayed with $ and 2 decimals', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('$45.00');
    expect(html).toContain('$1.20');
  });

  it('knowledge stats section renders node and edge counts', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('268');
    expect(html).toContain('27');
    expect(html).toContain('150');
    expect(html).toContain('30');
  });

  it('empty v2 data shows graceful no-data messages', () => {
    const html = renderDashboard(emptyV2Data);
    // Should have multiple 'no data' or 'No' indicators
    const noDataCount = (html.match(/[Nn]o .* data/gi) || []).length;
    expect(noDataCount).toBeGreaterThanOrEqual(2);
  });

  it('renders model cost chart', () => {
    const html = renderDashboard(sampleData);
    expect(html).toContain('model-cost-chart');
  });

  it('GREEN percentage shown in overview cards', () => {
    const html = renderDashboard(sampleData);
    // 18/25 = 72.0%
    expect(html).toContain('72.0%');
  });
});
