import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkCrossRefIntegrity } from '../../aurora/cross-ref.js';

/** Register the aurora_cross_ref_integrity MCP tool on the given server. */
export function registerCrossRefIntegrityTool(server: McpServer): void {
  server.tool(
    'aurora_cross_ref_integrity',
    'Check integrity of cross-references — finds Neuron nodes with low confidence linked to Aurora docs',
    {
      confidence_threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.5)
        .describe('Flag Neuron nodes below this confidence (default 0.5)'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Max issues to return (default 20)'),
    },
    async (args) => {
      try {
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
