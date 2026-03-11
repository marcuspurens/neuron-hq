import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createSpeakerIdentity, confirmSpeaker, listSpeakerIdentities } from '../../aurora/speaker-identity.js';

export function registerAuroraConfirmSpeakerTool(server: McpServer): void {
  server.tool(
    'aurora_confirm_speaker',
    'Confirm that a voice print belongs to a speaker identity. Creates identity if new.',
    {
      voicePrintId: z.string().describe('Voice print node ID'),
      identityName: z.string().describe('Speaker name to confirm'),
    },
    async (args) => {
      try {
        const identities = await listSpeakerIdentities();
        const existing = identities.find(i => i.name.toLowerCase() === args.identityName.toLowerCase());
        if (existing) {
          const result = await confirmSpeaker(existing.id, args.voicePrintId);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
        }
        const identity = await createSpeakerIdentity(args.identityName, args.voicePrintId);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ identity, newConfidence: identity.confidence }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
