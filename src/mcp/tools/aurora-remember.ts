import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { remember } from '../../aurora/memory.js';

/** Register the aurora_remember MCP tool on the given server. */
export function registerAuroraRememberTool(server: McpServer): void {
  server.tool(
    'aurora_remember',
    'Save a fact or preference to Aurora memory. Deduplicates against existing memories.',
    {
      text: z.string().min(1).describe('The fact or preference to remember'),
      type: z
        .enum(['fact', 'preference'])
        .optional()
        .default('fact')
        .describe('Type of memory'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .default('personal')
        .describe('Scope of the memory'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tags for categorization'),
      source: z
        .string()
        .optional()
        .describe('Source of the information'),
    },
    async (args) => {
      try {
        const result = await remember(args.text, {
          type: args.type,
          scope: args.scope,
          tags: args.tags,
          source: args.source,
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
