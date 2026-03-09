import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ingestYouTube, isYouTubeUrl } from '../../aurora/youtube.js';
import type { YouTubeIngestOptions } from '../../aurora/youtube.js';

/** Register aurora_ingest_youtube MCP tool. */
export function registerAuroraIngestYouTubeTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_youtube',
    'Ingest a YouTube video: extract audio, transcribe, optionally identify speakers, and store in Aurora knowledge base.',
    {
      url: z.string().url().describe('YouTube video URL'),
      diarize: z
        .boolean()
        .optional()
        .default(false)
        .describe('Run speaker identification (requires pyannote)'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .default('personal')
        .describe('Scope for the nodes'),
      whisper_model: z
        .enum(['tiny', 'small', 'medium', 'large'])
        .optional()
        .default('small')
        .describe('Whisper model to use for transcription'),
    },
    async (args) => {
      try {
        if (!isYouTubeUrl(args.url)) {
          return {
            content: [
              { type: 'text' as const, text: 'Error: Not a valid YouTube URL' },
            ],
            isError: true,
          };
        }

        const options: YouTubeIngestOptions = {
          diarize: args.diarize,
          scope: args.scope,
          whisperModel: args.whisper_model,
        };

        const result = await ingestYouTube(args.url, options);

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
