import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ingestVideo } from '../../aurora/video.js';
import type { VideoIngestOptions } from '../../aurora/video.js';

/** Register aurora_ingest_video MCP tool. */
export function registerAuroraIngestVideoTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_video',
    'Ingest a video (YouTube, SVT, Vimeo, TV4, TikTok, etc.): extract audio, transcribe, optionally identify speakers, and store in Aurora knowledge base.',
    {
      url: z.string().url().describe('Video URL (any yt-dlp supported site)'),
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
        const options: VideoIngestOptions = {
          diarize: args.diarize,
          scope: args.scope,
          whisperModel: args.whisper_model,
        };

        const result = await ingestVideo(args.url, options);

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
