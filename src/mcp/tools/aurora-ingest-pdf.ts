import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { startPdfIngestJob } from '../../aurora/job-runner.js';

export function registerAuroraIngestPdfTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_pdf',
    'Queue a PDF for rich indexing: text extraction + vision analysis of tables, charts and diagrams. Returns immediately with a job ID. Use aurora_jobs to track progress.',
    {
      path: z.string().min(1).describe('Path to PDF file'),
      language: z
        .string()
        .optional()
        .default('en')
        .describe('Language hint for OCR (en, sv, de, fr, etc.)'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .default('personal')
        .describe('Scope for the created nodes'),
    },
    async (args) => {
      try {
        const result = await startPdfIngestJob(args.path, {
          language: args.language,
          scope: args.scope,
        });

        const queueStr = result.queuePosition ? `\nPosition ${result.queuePosition} in queue` : '';

        return {
          content: [
            {
              type: 'text' as const,
              text: `Queued! 📄\n"${result.title}" (${result.pageCount ?? '?'} pages)\nJob ID: ${result.jobId}${queueStr}`,
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
    }
  );
}
