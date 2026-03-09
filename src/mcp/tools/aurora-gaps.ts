import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGaps } from '../../aurora/knowledge-gaps.js';

/** Register the aurora_gaps MCP tool on the given server. */
export function registerAuroraGapsTool(server: McpServer): void {
  server.tool(
    'aurora_gaps',
    'List knowledge gaps — questions that Aurora could not answer due to missing sources.',
    {
      limit: z.number().min(1).max(50).optional().default(10),
    },
    async (args) => {
      try {
        const result = await getGaps(args.limit);
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
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
