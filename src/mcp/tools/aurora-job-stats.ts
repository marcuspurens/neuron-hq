import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getJobStats } from '../../aurora/job-runner.js';

/** Register aurora_job_stats MCP tool — aggregate job statistics. */
export function registerAuroraJobStatsTool(server: McpServer): void {
  server.tool(
    'aurora_job_stats',
    'Show aggregate video ingest statistics: total videos, hours, compute time, backend distribution, success rate.',
    {},
    async () => {
      try {
        const stats = await getJobStats();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
