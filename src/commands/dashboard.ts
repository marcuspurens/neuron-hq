import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { getBeliefs, getBeliefHistory, getSummary } from '../core/run-statistics.js';
import { renderDashboard } from './dashboard-template.js';
import type { DashboardData } from './dashboard-template.js';
import type { RunBeliefAudit } from '../core/run-statistics.js';

/**
 * Collect dashboard data from run statistics.
 * Fetches beliefs, summary, and history for the top 10 dimensions.
 */
export async function collectDashboardData(): Promise<DashboardData> {
  const beliefs = await getBeliefs();
  const summary = await getSummary();

  // Get history for top 10 dimensions (beliefs are already sorted by confidence DESC)
  const historyMap: Record<string, RunBeliefAudit[]> = {};
  for (const b of beliefs.slice(0, 10)) {
    historyMap[b.dimension] = await getBeliefHistory(b.dimension, 50);
  }

  return { beliefs, summary, historyMap };
}

/**
 * CLI command: dashboard
 * Collects run statistics, renders an HTML dashboard, writes it to
 * runs/dashboard.html, and optionally opens it in the default browser.
 */
export async function dashboardCommand(options: { open?: boolean }): Promise<void> {
  // 1. Collect data
  const data = await collectDashboardData();

  // 2. Render HTML
  const html = renderDashboard(data);

  // 3. Write to runs/dashboard.html
  // Use dynamic import for BASE_DIR to avoid circular dependency issues
  const { BASE_DIR } = await import('../cli.js');
  const outPath = path.join(BASE_DIR, 'runs', 'dashboard.html');
  await fs.writeFile(outPath, html, 'utf-8');

  console.log(`Dashboard written to ${outPath}`);

  // 4. Open in browser unless --no-open
  if (options.open !== false) {
    exec(`open "${outPath}"`);
  }
}
