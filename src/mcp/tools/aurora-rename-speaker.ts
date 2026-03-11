import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { renameSpeaker } from '../../aurora/voiceprint.js';

/** Register aurora_rename_speaker MCP tool. */
export function registerAuroraRenameSpeakerTool(server: McpServer): void {
  server.tool(
    'aurora_rename_speaker',
    'Rename a speaker in a voice print (e.g., SPEAKER_1 → "Marcus")',
    {
      voicePrintId: z.string().describe('ID of the voice_print node'),
      newName: z.string().min(1).describe('New speaker name'),
    },
    async (args) => {
      try {
        const result = await renameSpeaker(args.voicePrintId, args.newName);
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
