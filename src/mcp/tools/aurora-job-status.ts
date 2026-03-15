import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getJob } from '../../aurora/job-runner.js';

/** Register aurora_job_status MCP tool. */
export function registerAuroraJobStatusTool(server: McpServer): void {
  server.tool(
    'aurora_job_status',
    'Check progress and status of a video ingest job.',
    {
      job_id: z.string().uuid().describe('Job ID returned by aurora_ingest_video'),
    },
    async (args) => {
      try {
        const job = await getJob(args.job_id);
        if (!job) {
          return {
            content: [
              { type: 'text' as const, text: `Job not found: ${args.job_id}` },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(job, null, 2),
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
