import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findAuroraNodes, loadAuroraGraph } from '../../aurora/aurora-graph.js';
import { renameSpeaker, mergeSpeakers, suggestSpeakerMatches } from '../../aurora/voiceprint.js';
import {
  listSpeakerIdentities,
  createSpeakerIdentity,
  confirmSpeaker,
  rejectSpeakerSuggestion,
  autoTagSpeakers,
} from '../../aurora/speaker-identity.js';

/** Register the consolidated aurora_speakers MCP tool. */
export function registerAuroraSpeakersTool(server: McpServer): void {
  server.tool(
    'aurora_speakers',
    'Manage speaker voice prints and identities. Actions: gallery, identities, rename, merge, suggest, confirm, reject, auto_tag.',
    {
      action: z.enum([
        'gallery',
        'identities',
        'rename',
        'merge',
        'suggest',
        'confirm',
        'reject',
        'auto_tag',
      ]),
      voicePrintId: z.string().optional().describe('Voice print node ID'),
      targetId: z.string().optional().describe('Target voice print ID (for merge)'),
      newName: z.string().optional().describe('New speaker name (for rename)'),
      identityName: z.string().optional().describe('Speaker identity name (for confirm)'),
      identityId: z.string().optional().describe('Speaker identity ID (for reject)'),
      voicePrintIds: z.array(z.string()).optional().describe('Array of voice print IDs (for auto_tag)'),
      threshold: z.number().min(0).max(1).optional().default(0.7).describe('Similarity threshold (for suggest)'),
    },
    async (args) => {
      try {
        let result: unknown;

        switch (args.action) {
          case 'gallery': {
            const graph = await loadAuroraGraph();
            const voicePrints = findAuroraNodes(graph, { type: 'voice_print' });
            if (voicePrints.length === 0) {
              return {
                content: [{
                  type: 'text' as const,
                  text: 'No voice prints found. Ingest a YouTube video with --diarize to create voice prints.',
                }],
              };
            }
            const gallery = voicePrints.map((node) => ({
              id: node.id,
              title: node.title,
              speakerLabel: node.properties.speakerLabel,
              videoId: node.properties.videoId,
              segmentCount: node.properties.segmentCount,
              totalDurationMs: node.properties.totalDurationMs,
              confidence: node.confidence,
              created: node.created,
            }));
            result = { voicePrints: gallery, count: gallery.length };
            break;
          }

          case 'identities':
            result = await listSpeakerIdentities();
            break;

          case 'rename':
            if (!args.voicePrintId || !args.newName) {
              throw new Error('voicePrintId and newName required for rename');
            }
            result = await renameSpeaker(args.voicePrintId, args.newName);
            break;

          case 'merge':
            if (!args.voicePrintId || !args.targetId) {
              throw new Error('voicePrintId (source) and targetId required for merge');
            }
            result = await mergeSpeakers(args.voicePrintId, args.targetId);
            break;

          case 'suggest': {
            const matches = await suggestSpeakerMatches({
              voicePrintId: args.voicePrintId,
              threshold: args.threshold,
            });
            result = matches.length > 0 ? matches : 'No matches found above threshold.';
            break;
          }

          case 'confirm': {
            if (!args.voicePrintId || !args.identityName) {
              throw new Error('voicePrintId and identityName required for confirm');
            }
            const identities = await listSpeakerIdentities();
            const existing = identities.find(
              (i) => i.displayName.toLowerCase() === args.identityName!.toLowerCase(),
            );
            if (existing) {
              result = await confirmSpeaker(existing.id, args.voicePrintId);
            } else {
              const identity = await createSpeakerIdentity(args.identityName, args.voicePrintId);
              result = { identity, newConfidence: identity.confidence };
            }
            break;
          }

          case 'reject':
            if (!args.identityId || !args.voicePrintId) {
              throw new Error('identityId and voicePrintId required for reject');
            }
            await rejectSpeakerSuggestion(args.identityId, args.voicePrintId);
            result = {
              rejected: true,
              identityId: args.identityId,
              voicePrintId: args.voicePrintId,
            };
            break;

          case 'auto_tag':
            if (!args.voicePrintIds || args.voicePrintIds.length === 0) {
              throw new Error('voicePrintIds array required for auto_tag');
            }
            result = await autoTagSpeakers(args.voicePrintIds);
            break;
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
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
