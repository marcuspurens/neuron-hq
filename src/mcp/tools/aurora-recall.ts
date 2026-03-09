import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { recall } from '../../aurora/memory.js';

/** Register the aurora_recall MCP tool on the given server. */
export function registerAuroraRecallTool(server: McpServer): void {
  server.tool(
    'aurora_recall',
    'Recall relevant facts and preferences from Aurora memory based on a query.',
    {
      query: z
        .string()
        .min(1)
        .describe('What to recall (topic, question, or keyword)'),
      type: z
        .enum(['fact', 'preference'])
        .optional()
        .describe('Filter by memory type'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .describe('Filter by scope'),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum number of memories to return'),
    },
    async (args) => {
      try {
        const result = await recall(args.query, {
          type: args.type,
          scope: args.scope,
          limit: args.limit,
        });
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
