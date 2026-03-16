import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { remember, recall, memoryStats } from '../../aurora/memory.js';

/** Register the consolidated aurora_memory MCP tool on the given server. */
export function registerAuroraMemoryConsolidatedTool(
  server: McpServer,
): void {
  server.tool(
    'aurora_memory',
    'Manage Aurora memory — remember facts, recall information, view statistics. Actions: remember, recall, stats.',
    {
      action: z.enum(['remember', 'recall', 'stats']),
      text: z
        .string()
        .optional()
        .describe('The fact or preference to remember (for remember)'),
      query: z
        .string()
        .optional()
        .describe('What to recall (for recall)'),
      type: z
        .enum(['fact', 'preference'])
        .optional()
        .describe('Memory type filter'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .describe('Scope filter'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tags for categorization (for remember)'),
      source: z
        .string()
        .optional()
        .describe('Source of information (for remember)'),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Max results (for recall)'),
    },
    async (args) => {
      try {
        switch (args.action) {
          case 'remember': {
            if (!args.text) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: 'Error: "text" is required for the remember action.',
                  },
                ],
                isError: true,
              };
            }
            const result = await remember(args.text, {
              type: args.type ?? 'fact',
              scope: args.scope ?? 'personal',
              tags: args.tags,
              source: args.source,
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
          case 'recall': {
            if (!args.query) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: 'Error: "query" is required for the recall action.',
                  },
                ],
                isError: true,
              };
            }
            const result = await recall(args.query, {
              type: args.type,
              scope: args.scope,
              limit: args.limit,
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
          case 'stats': {
            const result = await memoryStats();
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }
        }
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
