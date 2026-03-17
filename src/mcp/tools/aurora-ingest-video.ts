import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { startVideoIngestJob } from '../../aurora/job-runner.js';

/** Register aurora_ingest_video MCP tool (async — returns job ID immediately). */
export function registerAuroraIngestVideoTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_video',
    'Queue a video for ingestion (YouTube, SVT, Vimeo, TV4, TikTok, etc.): returns immediately with a job ID. Use aurora_job_status to track progress.',
    {
      url: z.string().url().describe('Video URL (any yt-dlp supported site)'),
      diarize: z
        .boolean()
        .optional()
        .default(true)
        .describe('Run speaker identification (requires pyannote). Default: true'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .default('personal')
        .describe('Scope for the nodes'),
      whisper_model: z
        .string()
        .optional()
        .describe(
          'Whisper model to use for transcription (e.g. small, large, KBLab/kb-whisper-large)',
        ),
      language: z
        .string()
        .optional()
        .describe('Language code (e.g. "sv", "en") — skip auto-detection'),
    },
    async (args) => {
      try {
        const result = await startVideoIngestJob(args.url, {
          diarize: args.diarize,
          scope: args.scope,
          whisperModel: args.whisper_model,
          language: args.language,
        });

        if (result.status === 'already_ingested') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Video already ingested. Existing result:\n${JSON.stringify(result.existingResult, null, 2)}`,
              },
            ],
          };
        }

        if (result.status === 'duplicate') {
          const durationStr = result.videoDurationSec
            ? `${Math.round(result.videoDurationSec / 60)} min`
            : 'unknown duration';
          return {
            content: [
              {
                type: 'text' as const,
                text: `Already queued/running: "${result.videoTitle ?? 'Unknown'}" (${durationStr})\nExisting job ID: ${result.existingJobId}\nQueue position: ${result.queuePosition ?? 'N/A'}`,
              },
            ],
          };
        }

        // New job queued
        const durationStr = result.videoDurationSec
          ? `${Math.round(result.videoDurationSec / 60)} min`
          : 'unknown duration';
        const etaStr = result.estimatedTimeMs
          ? `~${Math.round(result.estimatedTimeMs / 60000)} min`
          : 'unknown';
        const queueStr = result.queuePosition
          ? `Position ${result.queuePosition} in queue`
          : '';

        return {
          content: [
            {
              type: 'text' as const,
              text: `Queued! 🎬\n"${result.videoTitle ?? 'Unknown'}" (${durationStr})\nEstimated time: ${etaStr}\nJob ID: ${result.jobId}${queueStr ? '\n' + queueStr : ''}`,
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
