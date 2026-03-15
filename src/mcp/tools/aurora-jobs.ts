import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getJobs } from '../../aurora/job-runner.js';

/** Register aurora_jobs MCP tool — lists recent jobs. */
export function registerAuroraJobsTool(server: McpServer): void {
  server.tool(
    'aurora_jobs',
    'List recent video ingest jobs with their status.',
    {
      status: z
        .string()
        .optional()
        .describe('Filter by status: queued, running, done, error, cancelled'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Max number of jobs to return'),
    },
    async (args) => {
      try {
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
            {
              type: 'text' as const,
              text: JSON.stringify(jobs, null, 2),
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
