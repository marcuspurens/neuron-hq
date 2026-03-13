import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { collectDashboardData } from './dashboard-data.js';
import { renderDashboard } from './dashboard-template.js';

// Re-export for backwards compatibility
export { collectDashboardData };

/**
 * CLI command: dashboard
 * Collects run statistics, renders an HTML dashboard, writes it to
 * runs/dashboard.html, and optionally opens it in the default browser.
 */
export async function dashboardCommand(options: { open?: boolean }): Promise<void> {
  const data = await collectDashboardData();
  const html = renderDashboard(data);

  const { BASE_DIR } = await import('../cli.js');
  const outPath = path.join(BASE_DIR, 'runs', 'dashboard.html');
  await fs.writeFile(outPath, html, 'utf-8');

  console.log(`Dashboard written to ${outPath}`);

  if (options.open !== false) {
    exec(`open "${outPath}"`);
  }
}
