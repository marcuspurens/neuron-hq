import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { briefing } from '../../aurora/briefing.js';

/** Register the aurora_briefing MCP tool on the given server. */
export function registerAuroraBriefingTool(server: McpServer): void {
  server.tool(
    'aurora_briefing',
    'Generate a comprehensive knowledge briefing about a topic. Combines facts, timeline, knowledge gaps, and cross-references between Neuron and Aurora knowledge graphs into a structured report with an AI-generated summary.',
    {
      topic: z.string().min(1).describe('The topic to generate a briefing about'),
      max_facts: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum facts to include'),
      max_timeline: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Maximum timeline entries'),
      max_gaps: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe('Maximum knowledge gaps'),
      max_cross_refs: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe('Maximum cross-refs per graph'),
    },
    async (args) => {
      try {
        const result = await briefing(args.topic, {
          maxFacts: args.max_facts,
          maxTimeline: args.max_timeline,
          maxGaps: args.max_gaps,
          maxCrossRefs: args.max_cross_refs,
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
