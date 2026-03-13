import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KnowledgeManagerAgent } from '../../core/agents/knowledge-manager.js';

/** Register the neuron_knowledge_manager MCP tool on the given server. */
export function registerKnowledgeManagerTool(server: McpServer): void {
  server.tool(
    'neuron_knowledge_manager',
    'Run the Knowledge Manager agent to scan for gaps, research them, and refresh stale sources.',
    {
      maxActions: z.number().min(1).max(50).optional().default(5).describe('Maximum actions to take'),
      focusTopic: z.string().optional().describe('Optional topic to focus on'),
      includeStale: z.boolean().optional().default(true).describe('Include stale source refresh'),
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
        });

        const report = await agent.run();

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
}
