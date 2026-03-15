import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { cancelJob } from '../../aurora/job-runner.js';

/** Register aurora_cancel_job MCP tool — cancel a queued or running job. */
export function registerAuroraCancelJobTool(server: McpServer): void {
  server.tool(
    'aurora_cancel_job',
    'Cancel a queued or running video ingest job.',
    {
      job_id: z.string().uuid().describe('Job ID to cancel'),
    },
    async (args) => {
      try {
        const result = await cancelJob(args.job_id);
        return {
          content: [
            {
              type: 'text' as const,
              text: result.success
                ? `✅ ${result.message}`
                : `❌ ${result.message}`,
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
