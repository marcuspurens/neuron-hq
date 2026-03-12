import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeImage, ingestImage } from '../../aurora/vision.js';

/** Register aurora_describe_image MCP tool. */
export function registerAuroraDescribeImageTool(server: McpServer): void {
  server.tool(
    'aurora_describe_image',
    'Analyze an image using local Ollama vision model and index description in Aurora',
    {
      imagePath: z.string().describe('Path to image file (png, jpg, webp, etc.)'),
      title: z.string().optional().describe('Document title (default: filename)'),
      prompt: z.string().optional().describe('Custom prompt for the vision model'),
      model: z.string().optional().describe('Ollama model (default: qwen3-vl:8b)'),
      describeOnly: z.boolean().optional().default(false)
        .describe('Only describe, do not ingest into Aurora'),
    },
    async (args) => {
      try {
        if (args.describeOnly) {
          const { description, modelUsed } = await analyzeImage(args.imagePath, {
            prompt: args.prompt,
            model: args.model,
          });
          return {
            content: [{ type: 'text' as const, text: `Model: ${modelUsed}\n\n${description}` }],
          };
        }

        const result = await ingestImage(args.imagePath, {
          title: args.title,
          prompt: args.prompt,
          model: args.model,
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Analyzed with ${result.modelUsed}\n\nDescription:\n${result.description}\n\nIndexed: ${result.documentNodeId} (${result.chunkCount} chunks, ${result.crossRefsCreated} cross-refs)`,
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(err as Error).message}`,
          }],
          isError: true,
        };
      }
    },
  );
}
