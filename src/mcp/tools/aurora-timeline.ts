import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { timeline } from '../../aurora/timeline.js';

/** Register the aurora_timeline MCP tool on the given server. */
export function registerAuroraTimelineTool(server: McpServer): void {
  server.tool(
    'aurora_timeline',
    'Get a chronological timeline of Aurora knowledge base entries.',
    {
      limit: z.number().min(1).max(100).optional().default(20),
      type: z.string().optional().describe('Filter by node type'),
      scope: z.enum(['personal', 'shared', 'project']).optional(),
      since: z.string().optional().describe('From date (ISO format)'),
    },
    async (args) => {
      try {
        const entries = await timeline({
          limit: args.limit,
          type: args.type,
          scope: args.scope,
          since: args.since,
        });
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(entries, null, 2) },
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
