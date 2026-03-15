import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { checkCompletedJobs, markJobNotified } from '../aurora/job-runner.js';
import { registerRunsTool } from './tools/runs.js';
import { registerKnowledgeTool } from './tools/knowledge.js';
import { registerCostsTool } from './tools/costs.js';
import { registerStartTool } from './tools/start.js';
import { registerAuroraStatusTool } from './tools/aurora-status.js';
import { registerAuroraSearchTool } from './tools/aurora-search.js';
import { registerAuroraIngestTools } from './tools/aurora-ingest.js';
import { registerAuroraAskTool } from './tools/aurora-ask.js';
import { registerAuroraRememberTool } from './tools/aurora-remember.js';
import { registerAuroraRecallTool } from './tools/aurora-recall.js';
import { registerAuroraMemoryStatsTool } from './tools/aurora-memory-stats.js';
import { registerAuroraIngestVideoTool } from './tools/aurora-ingest-video.js';
import { registerAuroraLearnConversationTool } from './tools/aurora-learn-conversation.js';
import { registerAuroraVoiceGalleryTool } from './tools/aurora-voice-gallery.js';
import { registerAuroraTimelineTool } from './tools/aurora-timeline.js';
import { registerAuroraGapsTool } from './tools/aurora-gaps.js';
import { registerCrossRefTool } from './tools/cross-ref.js';
import { registerAuroraBriefingTool } from './tools/aurora-briefing.js';
import { registerAuroraVerifyTool } from './tools/aurora-verify.js';
import { registerAuroraFreshnessTool } from './tools/aurora-freshness.js';
import { registerCrossRefIntegrityTool } from './tools/cross-ref-integrity.js';
import { registerAuroraSuggestResearchTool } from './tools/aurora-suggest-research.js';
import { registerAuroraCheckDepsTool } from './tools/aurora-check-deps.js';
import { registerAuroraRenameSpeakerTool } from './tools/aurora-rename-speaker.js';
import { registerAuroraMergeSpeakersTool } from './tools/aurora-merge-speakers.js';
import { registerAuroraSuggestSpeakersTool } from './tools/aurora-suggest-speakers.js';
import { registerAuroraConfirmSpeakerTool } from './tools/aurora-confirm-speaker.js';
import { registerAuroraRejectSpeakerTool } from './tools/aurora-reject-speaker.js';
import { registerAuroraSpeakerIdentitiesTool } from './tools/aurora-speaker-identities.js';
import { registerAuroraAutoTagSpeakersTool } from './tools/aurora-auto-tag-speakers.js';
import { registerAuroraIngestImageTool } from './tools/aurora-ingest-image.js';
import { registerAuroraDescribeImageTool } from './tools/aurora-describe-image.js';
import { registerAuroraOcrPdfTool } from './tools/aurora-ocr-pdf.js';
import { registerAuroraIngestBookTool } from './tools/aurora-ingest-book.js';
import { registerAuroraConfidenceTool } from './tools/aurora-confidence.js';
import { registerRunStatisticsTool } from './tools/run-statistics.js';
import { registerDashboardTool } from './tools/dashboard.js';
import { registerKnowledgeManagerTool } from './tools/knowledge-manager.js';
import { registerKnowledgeLibraryTool } from './tools/knowledge-library.js';
import { registerAuroraEbucoreMetadataTool } from './tools/aurora-ebucore-metadata.js';
import { registerCrossRefLookupTool } from './tools/crossref-lookup.js';
import { registerAuroraJobStatusTool } from './tools/aurora-job-status.js';
import { registerAuroraJobsTool } from './tools/aurora-jobs.js';
import { registerAuroraJobStatsTool } from './tools/aurora-job-stats.js';
import { registerAuroraCancelJobTool } from './tools/aurora-cancel-job.js';

/* ------------------------------------------------------------------ */
/*  Notification wrapper                                               */
/* ------------------------------------------------------------------ */

/**
 * Monkey-patches `server.tool()` so every registered handler automatically
 * checks for recently completed (within 5 min) un-notified jobs and prepends
 * a notification line to the tool response. The check is fail-safe — errors
 * are silently caught so they never break the underlying tool.
 */
function wrapToolsWithNotification(server: McpServer): McpServer {
  // Cast to a generic callable — the overloaded .tool() signature makes
  // typed spread impossible, but at runtime the SDK dispatches on arity.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalTool = server.tool.bind(server) as (...a: any[]) => any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.tool = function (...args: any[]) {
    const lastIdx = args.length - 1;
    const originalHandler = args[lastIdx] as (...a: unknown[]) => Promise<unknown>;

    args[lastIdx] = async (...handlerArgs: unknown[]) => {
      const result = await originalHandler(...handlerArgs);

      try {
        const completed = await checkCompletedJobs();
        if (completed.length > 0) {
          for (const job of completed) {
            await markJobNotified(job.id);
          }

          const notes = completed
            .map((j) => {
              const mins = j.videoDurationSec
                ? Math.round(j.videoDurationSec / 60)
                : '?';
              const chunks =
                (j.result as Record<string, unknown> | null)?.chunksCreated ?? '?';
              const crossRefs =
                (j.result as Record<string, unknown> | null)?.crossRefsCreated ?? 0;
              const ago = j.completedAt
                ? Math.round(
                    (Date.now() - new Date(j.completedAt).getTime()) / 60000,
                  )
                : '?';
              return `\u2705 BTW: Video job "${j.videoTitle ?? 'Unknown'}" finished ${ago} min ago (${mins} min, ${chunks} chunks, ${crossRefs} cross-refs)`;
            })
            .join('\n');

          const typed = result as {
            content?: Array<{ type: string; text: string }>;
          };
          if (typed?.content && Array.isArray(typed.content)) {
            typed.content.unshift({ type: 'text', text: notes });
          }
        }
      } catch {
        // Notification check should never break the tool
      }

      return result;
    };

    return originalTool(...args);
  } as typeof server.tool;

  return server;
}

/* ------------------------------------------------------------------ */
/*  Server creation                                                    */
/* ------------------------------------------------------------------ */

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'neuron-hq',
    version: '0.1.0',
  });

  // Wrap all tools with passive notification check
  wrapToolsWithNotification(server);

  registerRunsTool(server);
  registerKnowledgeTool(server);
  registerCostsTool(server);
  registerStartTool(server);
  registerAuroraStatusTool(server);
  registerAuroraSearchTool(server);
  registerAuroraIngestTools(server);
  registerAuroraAskTool(server);
  registerAuroraRememberTool(server);
  registerAuroraRecallTool(server);
  registerAuroraMemoryStatsTool(server);
  registerAuroraIngestVideoTool(server);
  registerAuroraVoiceGalleryTool(server);
  registerAuroraTimelineTool(server);
  registerAuroraGapsTool(server);
  registerCrossRefTool(server);
  registerAuroraBriefingTool(server);
  registerAuroraVerifyTool(server);
  registerAuroraFreshnessTool(server);
  registerAuroraLearnConversationTool(server);
  registerCrossRefIntegrityTool(server);
  registerAuroraSuggestResearchTool(server);
  registerAuroraCheckDepsTool(server);
  registerAuroraRenameSpeakerTool(server);
  registerAuroraMergeSpeakersTool(server);
  registerAuroraSuggestSpeakersTool(server);
  registerAuroraConfirmSpeakerTool(server);
  registerAuroraRejectSpeakerTool(server);
  registerAuroraSpeakerIdentitiesTool(server);
  registerAuroraAutoTagSpeakersTool(server);
  registerAuroraIngestImageTool(server);
  registerAuroraDescribeImageTool(server);
  registerAuroraOcrPdfTool(server);
  registerAuroraIngestBookTool(server);
  registerAuroraConfidenceTool(server);
  registerRunStatisticsTool(server);
  registerDashboardTool(server);
  registerKnowledgeManagerTool(server);
  registerKnowledgeLibraryTool(server);
  registerAuroraEbucoreMetadataTool(server);
  registerCrossRefLookupTool(server);
  registerAuroraJobStatusTool(server);
  registerAuroraJobsTool(server);
  registerAuroraJobStatsTool(server);
  registerAuroraCancelJobTool(server);

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
