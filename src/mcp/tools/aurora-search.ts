import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadAuroraGraph, findAuroraNodes } from '../../aurora/aurora-graph.js';
import type { AuroraNodeType, AuroraScope } from '../../aurora/aurora-schema.js';

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
        let results: Array<Record<string, unknown>>;

        try {
          const { semanticSearch } = await import(
            '../../core/semantic-search.js'
          );
          const semanticResults = await semanticSearch(args.query, {
            table: 'aurora_nodes',
            type: args.type,
            scope: args.scope,
            limit: args.limit,
          });

          results = semanticResults.map((sr) => ({
            id: sr.id,
            title: sr.title,
            type: sr.type,
            similarity: sr.similarity,
            confidence: sr.confidence,
            scope: sr.scope,
            properties: {},
          }));
        } catch {
          // Semantic search unavailable, fall back to keyword search
          const graph = await loadAuroraGraph();
          results = findAuroraNodes(graph, {
            type: args.type as AuroraNodeType | undefined,
            query: args.query,
            scope: args.scope as AuroraScope | undefined,
          })
            .slice(0, args.limit ?? 10)
            .map((node) => ({
              id: node.id,
              title: node.title,
              type: node.type,
              similarity: null,
              confidence: node.confidence,
              scope: node.scope,
              properties: node.properties,
            }));
        }

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(results, null, 2) },
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
