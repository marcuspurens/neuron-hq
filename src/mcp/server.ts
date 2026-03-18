import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { checkCompletedJobs, markJobNotified } from '../aurora/job-runner.js';
import { SCOPES } from './scopes.js';

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
      } catch {  /* intentional: best-effort server cleanup */
        // Notification check should never break the tool
      }

      return result;
    };

    return originalTool(...args);
  } as typeof server.tool;

  return server;
}

/* ------------------------------------------------------------------ */
/*  Scopes that need the notification wrapper                          */
/* ------------------------------------------------------------------ */

const NOTIFICATION_SCOPES = new Set(['aurora-ingest-media', 'aurora-media']);

/* ------------------------------------------------------------------ */
/*  Server creation                                                    */
/* ------------------------------------------------------------------ */

export function createMcpServer(scope?: string): McpServer {
  const isAll = !scope || scope === 'all';

  const serverName = isAll ? 'neuron-hq' : `neuron-hq-${scope}`;

  const server = new McpServer({
    name: serverName,
    version: '0.1.0',
  });

  if (isAll) {
    // Backwards compatible: apply notification wrapper to all tools
    wrapToolsWithNotification(server);

    // Register all scopes
    for (const s of Object.values(SCOPES)) {
      s.registerTools(server);
    }
  } else {
    const selectedScope = SCOPES[scope];
    if (!selectedScope) {
      throw new Error(
        `Unknown scope: "${scope}". Available scopes: ${Object.keys(SCOPES).join(', ')}`,
      );
    }

    // Only apply notification wrapper for media/job-related scopes
    if (NOTIFICATION_SCOPES.has(scope)) {
      wrapToolsWithNotification(server);
    }

    selectedScope.registerTools(server);
  }

  return server;
}

export async function startStdioServer(scope?: string): Promise<void> {
  const server = createMcpServer(scope);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
