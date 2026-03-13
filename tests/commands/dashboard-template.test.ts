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
};

describe('renderDashboard', () => {
  it('renders valid HTML with empty data', () => {
    const emptyData: DashboardData = {
      beliefs: [],
      summary: { strongest: [], weakest: [], trending_up: [], trending_down: [] },
      historyMap: {},
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
});
