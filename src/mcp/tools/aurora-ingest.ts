import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ingestUrl, ingestDocument } from '../../aurora/intake.js';
import type { IngestOptions } from '../../aurora/intake.js';

/** Register aurora_ingest_url and aurora_ingest_doc MCP tools. */
export function registerAuroraIngestTools(server: McpServer): void {
  // Tool 1: aurora_ingest_url
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

  // Tool 2: aurora_ingest_doc
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
