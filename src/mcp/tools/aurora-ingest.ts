import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ingestUrl, ingestDocument } from '../../aurora/intake.js';
import type { IngestOptions } from '../../aurora/intake.js';
import { PipelineError } from '../../aurora/pipeline-errors.js';

/** Register the aurora_ingest_url MCP tool. */
export function registerAuroraIngestUrlTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_url',
    'Ingest a URL into Aurora knowledge graph. Extracts text, chunks it, generates embeddings, and creates document + chunk nodes.',
    {
      url: z.string().url().describe('URL to ingest'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .describe('Scope for created nodes (default: personal)'),
      type: z
        .enum(['document', 'transcript', 'fact', 'preference', 'research', 'voice_print'])
        .optional()
        .describe('Node type (default: document)'),
    },
    async (args) => {
      try {
        const options: IngestOptions = {};
        if (args.scope) options.scope = args.scope;
        if (args.type) options.type = args.type;

        const result = await ingestUrl(args.url, options);

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        const message = err instanceof PipelineError
          ? `❌ ${err.userMessage}\nProva: ${err.suggestion}`
          : `Error: ${(err as Error).message}`;
        return {
          content: [
            {
              type: 'text' as const,
              text: message,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/** Register the aurora_ingest_doc MCP tool. */
export function registerAuroraIngestDocTool(server: McpServer): void {
  server.tool(
    'aurora_ingest_doc',
    'Ingest a local file (text, markdown, or PDF) into Aurora knowledge graph. Extracts text, chunks it, generates embeddings, and creates document + chunk nodes.',
    {
      path: z.string().min(1).describe('Path to the file to ingest'),
      scope: z
        .enum(['personal', 'shared', 'project'])
        .optional()
        .describe('Scope for created nodes (default: personal)'),
      type: z
        .enum(['document', 'transcript', 'fact', 'preference', 'research', 'voice_print'])
        .optional()
        .describe('Node type (default: document)'),
    },
    async (args) => {
      try {
        const options: IngestOptions = {};
        if (args.scope) options.scope = args.scope;
        if (args.type) options.type = args.type;

        const result = await ingestDocument(args.path, options);

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        const message = err instanceof PipelineError
          ? `❌ ${err.userMessage}\nProva: ${err.suggestion}`
          : `Error: ${(err as Error).message}`;
        return {
          content: [
            {
              type: 'text' as const,
              text: message,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

/** Register both aurora_ingest_url and aurora_ingest_doc MCP tools. */
export function registerAuroraIngestTools(server: McpServer): void {
  registerAuroraIngestUrlTool(server);
  registerAuroraIngestDocTool(server);
}
