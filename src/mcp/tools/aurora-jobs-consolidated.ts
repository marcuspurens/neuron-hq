import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getJob, getJobs, getJobStats, cancelJob } from '../../aurora/job-runner.js';

/** Register aurora_jobs consolidated MCP tool — replaces 4 separate job tools. */
export function registerAuroraJobsConsolidatedTool(server: McpServer): void {
  server.tool(
    'aurora_jobs',
    'Manage video ingest jobs. Actions: status, list, stats, cancel.',
    {
      action: z.enum(['status', 'list', 'stats', 'cancel']),
      job_id: z.string().uuid().optional().describe('Job ID (for status/cancel)'),
      status: z
        .string()
        .optional()
        .describe('Filter by status: queued, running, done, error, cancelled (for list)'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Max jobs to return (for list)'),
    },
    async (args) => {
      try {
        switch (args.action) {
          case 'status': {
            if (!args.job_id) {
              throw new Error('job_id is required for status action');
            }
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
                { type: 'text' as const, text: JSON.stringify(job, null, 2) },
              ],
            };
          }

          case 'list': {
            const jobs = await getJobs({
              status: args.status,
              limit: args.limit,
            });
            if (jobs.length === 0) {
              return {
                content: [
                  { type: 'text' as const, text: 'No jobs found.' },
                ],
              };
            }
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(jobs, null, 2) },
              ],
            };
          }

          case 'stats': {
            const stats = await getJobStats();
            return {
              content: [
                { type: 'text' as const, text: JSON.stringify(stats, null, 2) },
              ],
            };
          }

          case 'cancel': {
            if (!args.job_id) {
              throw new Error('job_id is required for cancel action');
            }
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
          }
        }
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
