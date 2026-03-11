import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ingestImage } from '../../aurora/ocr.js';

/** Register aurora_ingest_image MCP tool. */
export function registerAuroraIngestImageTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_image',
    'Extract text from an image using OCR (PaddleOCR)',
    {
      filePath: z.string().describe('Path to image file (.png, .jpg, .jpeg, .webp, .tiff, .bmp)'),
      language: z.string().optional().default('en')
        .describe('Language hint for OCR (en, sv, de, fr, etc.)'),
    },
    async (args) => {
      try {
        const result = await ingestImage(args.filePath, {
          language: args.language,
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
