import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchAurora } from '../../aurora/search.js';

/** Register the aurora_search MCP tool on the given server. */
export function registerAuroraSearchTool(server: McpServer): void {
  server.tool(
    'aurora_search',
    'Semantic search over Aurora knowledge graph (documents, facts, preferences, research). Returns nodes ranked by similarity.',
    {
      query: z
        .string()
        .min(1)
        .describe(
          'Search text — will be embedded and matched against Aurora nodes',
        ),
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
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Max results to return'),
    },
    async (args) => {
      try {
        const results = await searchAurora(args.query, {
          type: args.type,
          scope: args.scope,
          limit: args.limit,
          includeRelated: true,
        });

        const mapped = results.map((r) => ({
          id: r.id,
          title: r.title,
          type: r.type,
          similarity: r.similarity,
          confidence: r.confidence,
          scope: r.scope,
          text: r.text,
          source: r.source,
          related: r.related ?? [],
        }));

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(mapped, null, 2) },
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
