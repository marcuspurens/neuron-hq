import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ask } from '../../aurora/ask.js';

/** Register the aurora_ask MCP tool on the given server. */
export function registerAuroraAskTool(server: McpServer): void {
  server.tool(
    'aurora_ask',
    'Ask a question and get an answer synthesized from Aurora knowledge base documents, with citations.',
    {
      question: z.string().min(1).describe('The question to answer'),
      type: z
        .enum([
          'document',
          'transcript',
          'fact',
          'preference',
          'research',
          'voice_print',
        ])
        .optional()
        .describe('Filter by node type'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .describe('Filter by scope'),
      max_sources: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .default(10)
        .describe('Maximum number of sources to use as context'),
      learn: z.boolean().optional().describe('Extract and save facts from the answer'),
      save_as_article: z.boolean().optional().describe('Save the answer as an article in the knowledge library'),
    },
    async (args) => {
      try {
        const result = await ask(args.question, {
          maxSources: args.max_sources,
          type: args.type,
          scope: args.scope,
          learn: args.learn,
          saveAsArticle: args.save_as_article,
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
