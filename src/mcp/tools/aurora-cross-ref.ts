import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { unifiedSearch } from '../../aurora/cross-ref.js';
import { checkCrossRefIntegrity } from '../../aurora/cross-ref.js';

/**
 * Register the consolidated `aurora_cross_ref` MCP tool on the given server.
 * Replaces the separate `neuron_cross_ref` and `aurora_cross_ref_integrity` tools.
 */
export function registerAuroraCrossRefConsolidatedTool(
  server: McpServer,
): void {
  server.tool(
    'aurora_cross_ref',
    'Cross-reference search and integrity checking across Neuron and Aurora knowledge graphs. Actions: search, integrity.',
    {
      action: z.enum(['search', 'integrity']),
      query: z
        .string()
        .optional()
        .describe('Search query (for search)'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(10)
        .describe('Max results'),
      min_similarity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.3)
        .describe('Min cosine similarity (for search)'),
      type: z
        .string()
        .optional()
        .describe('Filter by node type (for search)'),
      confidence_threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.5)
        .describe('Flag below this confidence (for integrity)'),
    },
    async (args) => {
      try {
        if (args.action === 'search') {
          return await handleSearch(args);
        }
        return await handleIntegrity(args);
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

/** Handle the 'search' action — cross-reference search across both graphs. */
async function handleSearch(args: {
  query?: string;
  limit: number;
  min_similarity: number;
  type?: string;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (!args.query) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: query is required for the search action.',
        },
      ],
    };
  }

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
}

/** Handle the 'integrity' action — check cross-reference integrity. */
async function handleIntegrity(args: {
  confidence_threshold: number;
  limit: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const issues = await checkCrossRefIntegrity({
    confidenceThreshold: args.confidence_threshold,
    limit: args.limit,
  });

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            totalIssues: issues.length,
            threshold: args.confidence_threshold,
            issues: issues.map((i) => ({
              crossRefId: i.crossRefId,
              neuronNodeId: i.neuronNodeId,
              neuronTitle: i.neuronTitle,
              neuronConfidence: i.neuronConfidence,
              auroraNodeId: i.auroraNodeId,
              auroraTitle: i.auroraTitle,
              issue: i.issue,
            })),
          },
          null,
          2,
        ),
      },
    ],
  };
}
