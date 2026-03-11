import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mergeSpeakers } from '../../aurora/voiceprint.js';

/** Register aurora_merge_speakers MCP tool. */
export function registerAuroraMergeSpeakersTool(server: McpServer): void {
  server.tool(
    'aurora_merge_speakers',
    'Merge two voice prints — source is removed, its segments transfer to target',
    {
      sourceId: z.string().describe('Voice print to remove (merged into target)'),
      targetId: z.string().describe('Voice print to keep (receives segments)'),
    },
    async (args) => {
      try {
        const result = await mergeSpeakers(args.sourceId, args.targetId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
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
