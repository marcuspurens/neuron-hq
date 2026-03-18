import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KnowledgeManagerAgent } from '../../core/agents/knowledge-manager.js';
import { logKMRun } from '../../aurora/km-log.js';

/** Register the neuron_knowledge_manager MCP tool on the given server. */
export function registerKnowledgeManagerTool(server: McpServer): void {
  server.tool(
    'neuron_knowledge_manager',
    'Run the Knowledge Manager agent to scan for gaps, research them, and refresh stale sources.',
    {
      maxActions: z.number().min(1).max(50).optional().default(5).describe('Maximum actions to take'),
      focusTopic: z.string().optional().describe('Optional topic to focus on'),
      includeStale: z.boolean().optional().default(true).describe('Include stale source refresh'),
      chain: z.boolean().optional().default(false).describe('Enable topic chaining for multi-cycle research'),
      maxCycles: z.number().min(1).max(10).optional().default(3).describe('Maximum chaining cycles (only used when chain=true)'),
    },
    async (args) => {
      try {
        const audit = {
          log: async (_entry: unknown): Promise<void> => {
            /* noop for MCP */
          },
        };

        const agent = new KnowledgeManagerAgent(audit, {
          maxActions: args.maxActions,
          focusTopic: args.focusTopic,
          includeStale: args.includeStale,
          chain: args.chain,
          maxCycles: args.maxCycles,
        });

        const startMs = Date.now();
        const report = await agent.run();
        const durationMs = Date.now() - startMs;

        // Log KM run (non-fatal)
        try {
          await logKMRun({
            trigger: 'manual-mcp',
            topic: args.focusTopic,
            report,
            durationMs,
            chainId: report.chainId,
            cycleNumber: report.cycleNumber,
            stoppedBy: report.stoppedBy,
          });
        } catch (err) {
          console.error('[knowledge-manager] knowledge manager operation failed:', err);
        }

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(report, null, 2) },
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

  server.tool(
    'neuron_km_chain_status',
    'Get the status of a Knowledge Manager chain — shows all cycles in a chaining run.',
    {
      chainId: z.string().uuid().describe('UUID of the chain to look up'),
    },
    async (args) => {
      try {
        const { getChainStatus } = await import('../../aurora/km-log.js');
        const entries = await getChainStatus(args.chainId);

        if (entries.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No chain found with ID: ${args.chainId}` }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
