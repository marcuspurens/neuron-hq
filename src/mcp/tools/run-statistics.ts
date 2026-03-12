import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getBeliefs, getBeliefHistory, getSummary } from '../../core/run-statistics.js';

export function registerRunStatisticsTool(server: McpServer): void {
  server.tool(
    'neuron_run_statistics',
    'Get Bayesian beliefs about Neuron run performance per agent, brief type, target, and model',
    {
      filter: z.string().optional().describe("Filter prefix: 'agent', 'brief', 'model', 'target'"),
      dimension: z.string().optional().describe("Specific dimension for history, e.g. 'agent:implementer'"),
      summary: z.boolean().optional().default(false).describe('Return strongest/weakest/trends summary'),
    },
    async (args) => {
      try {
        // History mode
        if (args.dimension) {
          const history = await getBeliefHistory(args.dimension);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ dimension: args.dimension, history }, null, 2),
            }],
          };
        }

        // Summary mode
        if (args.summary) {
          const summary = await getSummary();
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(summary, null, 2),
            }],
          };
        }

        // Default: list beliefs
        const beliefs = await getBeliefs(args.filter ? { prefix: args.filter } : undefined);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(beliefs, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(err as Error).message}`,
          }],
          isError: true,
        };
      }
    },
  );
}
