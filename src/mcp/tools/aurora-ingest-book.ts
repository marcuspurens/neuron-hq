import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ingestImageBatch } from '../../aurora/ocr.js';

/** Register aurora_ingest_book MCP tool. */
export function registerAuroraIngestBookTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_book',
    'Batch OCR a folder of scanned images into a single document (book/report)',
    {
      folderPath: z.string().describe('Path to folder containing scanned images'),
      language: z.string().optional().default('en')
        .describe('OCR language hint (en, sv, de, fr, etc.)'),
      title: z.string().optional()
        .describe('Document title (default: folder name)'),
      outputPath: z.string().optional()
        .describe('Save combined markdown to this path'),
    },
    async (args) => {
      try {
        const result = await ingestImageBatch(args.folderPath, {
          language: args.language,
          title: args.title,
          outputPath: args.outputPath,
        });

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
