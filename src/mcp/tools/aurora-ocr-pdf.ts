import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ocrPdf } from '../../aurora/ocr.js';

/** Register aurora_ocr_pdf MCP tool. */
export function registerAuroraOcrPdfTool(server: McpServer): void {
  server.tool(
    'aurora_ocr_pdf',
    'Re-extract text from a PDF using OCR (for broken font encoding)',
    {
      filePath: z.string().describe('Path to PDF file'),
      language: z.string().optional().default('en')
        .describe('Language hint for OCR'),
      dpi: z.number().optional().default(200)
        .describe('Render resolution (higher = better quality, slower)'),
    },
    async (args) => {
      try {
        const result = await ocrPdf(args.filePath, {
          language: args.language,
          dpi: args.dpi,
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
