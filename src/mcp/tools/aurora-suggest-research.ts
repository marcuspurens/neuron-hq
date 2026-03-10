import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { suggestResearch, suggestResearchBatch } from '../../aurora/gap-brief.js';

/** Register the aurora_suggest_research MCP tool on the given server. */
export function registerAuroraSuggestResearchTool(server: McpServer): void {
  server.tool(
    'aurora_suggest_research',
    'Generate research suggestions from knowledge gaps. Provide a question for a specific gap, or omit for top gaps.',
    {
      question: z
        .string()
        .optional()
        .describe('Specific gap question (omit for top gaps)'),
      top: z
        .number()
        .min(1)
        .max(10)
        .optional()
        .default(3)
        .describe('Number of top gaps (when no question)'),
      max_facts: z
        .number()
        .min(0)
        .max(20)
        .optional()
        .default(10)
        .describe('Max known facts to include'),
    },
    async (args) => {
      try {
        if (args.question) {
          const result = await suggestResearch(args.question, {
            maxFacts: args.max_facts,
          });
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(result, null, 2) },
            ],
          };
        }
        const results = await suggestResearchBatch({
          topN: args.top,
          maxFacts: args.max_facts,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(results, null, 2),
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
