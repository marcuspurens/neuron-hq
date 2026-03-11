import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { rejectSpeakerSuggestion } from '../../aurora/speaker-identity.js';

export function registerAuroraRejectSpeakerTool(server: McpServer): void {
  server.tool(
    'aurora_reject_speaker',
    'Reject a speaker identity suggestion for a voice print',
    {
      identityId: z.string().describe('Speaker identity ID to reject'),
      voicePrintId: z.string().describe('Voice print that is NOT this identity'),
    },
    async (args) => {
      try {
        await rejectSpeakerSuggestion(args.identityId, args.voicePrintId);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ rejected: true, identityId: args.identityId, voicePrintId: args.voicePrintId }) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
