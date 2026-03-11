import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listSpeakerIdentities } from '../../aurora/speaker-identity.js';

export function registerAuroraSpeakerIdentitiesTool(server: McpServer): void {
  server.tool(
    'aurora_speaker_identities',
    'List all known speaker identities with confidence levels',
    {},
    async () => {
      try {
        const identities = await listSpeakerIdentities();
        return { content: [{ type: 'text' as const, text: JSON.stringify(identities, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
