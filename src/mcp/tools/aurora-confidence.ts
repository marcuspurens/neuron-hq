import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfidenceHistory } from '../../aurora/bayesian-confidence.js';

/** Register the aurora_confidence_history MCP tool on the given server. */
export function registerAuroraConfidenceTool(server: McpServer): void {
  server.tool(
    'aurora_confidence_history',
    'Show Bayesian confidence update history for an Aurora knowledge node',
    {
      nodeId: z.string().describe('Aurora node ID (e.g., doc_abc123)'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max entries to return'),
    },
    async (args) => {
      try {
        const history = await getConfidenceHistory(args.nodeId, args.limit);
        if (history.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `No confidence history found for node: ${args.nodeId}`,
            }],
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(history, null, 2),
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
