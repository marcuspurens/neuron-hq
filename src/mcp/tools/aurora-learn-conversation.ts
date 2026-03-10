import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { learnFromConversation } from '../../aurora/conversation.js';

/** Register the aurora_learn_conversation MCP tool on the given server. */
export function registerAuroraLearnConversationTool(server: McpServer): void {
  server.tool(
    'aurora_learn_conversation',
    'Extract and learn facts, preferences, and decisions from a conversation',
    {
      messages: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          }),
        )
        .describe('Conversation messages to learn from'),
      dry_run: z
        .boolean()
        .optional()
        .default(false)
        .describe('Preview without storing (default false)'),
    },
    async (args) => {
      try {
        const result = await learnFromConversation(args.messages, {
          dryRun: args.dry_run,
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
