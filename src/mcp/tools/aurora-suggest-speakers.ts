import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { suggestSpeakerMatches } from '../../aurora/voiceprint.js';

/** Register aurora_suggest_speakers MCP tool. */
export function registerAuroraSuggestSpeakersTool(server: McpServer): void {
  server.tool(
    'aurora_suggest_speakers',
    'Suggest which speakers might be the same person across different videos',
    {
      voicePrintId: z
        .string()
        .optional()
        .describe('Limit to matches for this voice print'),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .default(0.7)
        .describe('Minimum similarity threshold (0-1)'),
    },
    async (args) => {
      try {
        const matches = await suggestSpeakerMatches({
          voicePrintId: args.voicePrintId,
          threshold: args.threshold,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text:
                matches.length > 0
                  ? JSON.stringify(matches, null, 2)
                  : 'No matches found above threshold.',
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
