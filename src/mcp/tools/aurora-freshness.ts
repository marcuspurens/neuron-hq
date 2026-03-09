import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getFreshnessReport } from '../../aurora/freshness.js';

/** Register the aurora_freshness_report MCP tool on the given server. */
export function registerAuroraFreshnessTool(server: McpServer): void {
  server.tool(
    'aurora_freshness_report',
    'Get freshness report for Aurora sources — shows which need re-verification',
    {
      only_stale: z.boolean().optional().default(false).describe('Only show stale/unverified'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max sources (default 20)'),
    },
    async (args) => {
      try {
        const report = await getFreshnessReport({
          onlyStale: args.only_stale,
          limit: args.limit,
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(report, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(err as Error).message}`,
          }],
          isError: true,
        };
      }
    },
  );
}
