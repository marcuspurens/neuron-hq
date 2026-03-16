import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifySource, getFreshnessReport } from '../../aurora/freshness.js';

/**
 * Register the consolidated aurora_freshness MCP tool on the given server.
 * Replaces the separate aurora_verify_source and aurora_freshness_report tools.
 */
export function registerAuroraFreshnessConsolidatedTool(server: McpServer): void {
  server.tool(
    'aurora_freshness',
    'Check and manage source freshness in Aurora. Actions: verify, report.',
    {
      action: z.enum(['verify', 'report']),
      node_id: z.string().optional().describe('Aurora node ID to verify (for verify)'),
      only_stale: z.boolean().optional().default(false).describe('Only show stale/unverified (for report)'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max sources (for report)'),
    },
    async (args) => {
      try {
        if (args.action === 'verify') {
          if (!args.node_id) {
            return {
              content: [{
                type: 'text' as const,
                text: 'Error: node_id is required for verify action',
              }],
              isError: true,
            };
          }
          const updated = await verifySource(args.node_id);
          return {
            content: [{
              type: 'text' as const,
              text: updated
                ? `Source ${args.node_id} marked as verified`
                : `Node ${args.node_id} not found`,
            }],
          };
        }

        // action === 'report'
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
