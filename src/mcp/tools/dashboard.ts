import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { renderDashboard } from '../../commands/dashboard-template.js';
import { collectDashboardData } from '../../commands/dashboard.js';

export function registerDashboardTool(server: McpServer): void {
  server.tool(
    'neuron_dashboard',
    'Generate and return the Neuron statistics dashboard as HTML',
    {},
    async () => {
      try {
        const data = await collectDashboardData();
        const html = renderDashboard(data);
        return {
          content: [{ type: 'text' as const, text: html }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
