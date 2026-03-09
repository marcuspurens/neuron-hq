import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { unifiedSearch } from '../../aurora/cross-ref.js';

/** Register the neuron_cross_ref MCP tool on the given server. */
export function registerCrossRefTool(server: McpServer): void {
  server.tool(
    'neuron_cross_ref',
    'Search across both Neuron (code patterns) and Aurora (research/documents) knowledge graphs simultaneously. Shows connections between what was built and what was researched.',
    {
      query: z.string().describe('Search query'),
      limit: z
        .number()
        .min(1)
        .max(50)
        .optional()
        .default(10)
        .describe('Max results per graph'),
      min_similarity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.3)
        .describe('Minimum cosine similarity'),
      type: z
        .string()
        .optional()
        .describe(
          'Filter by node type (pattern/error/technique/document/fact/etc)',
        ),
    },
    async (args) => {
      try {
        const result = await unifiedSearch(args.query, {
          limit: args.limit,
          minSimilarity: args.min_similarity,
          type: args.type,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  neuron: result.neuronResults.map((r) => ({
                    id: r.node.id,
                    title: r.node.title,
                    type: r.node.type,
                    similarity: r.similarity,
                    crossRefs: r.existingRef ? [r.existingRef] : [],
                  })),
                  aurora: result.auroraResults.map((r) => ({
                    id: r.node.id,
                    title: r.node.title,
                    type: r.node.type,
                    similarity: r.similarity,
                    crossRefs: r.existingRef ? [r.existingRef] : [],
                  })),
                  totalCrossRefs: result.crossRefs.length,
                },
                null,
                2,
              ),
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
