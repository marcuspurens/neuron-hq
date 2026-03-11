import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { autoTagSpeakers } from '../../aurora/speaker-identity.js';

export function registerAuroraAutoTagSpeakersTool(server: McpServer): void {
  server.tool(
    'aurora_auto_tag_speakers',
    'Automatically tag voice prints with matching speaker identities',
    {
      voicePrintIds: z.array(z.string()).describe('Array of voice print IDs to auto-tag'),
    },
    async (args) => {
      try {
        const results = await autoTagSpeakers(args.voicePrintIds);
        return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
