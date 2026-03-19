import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { obsidianExportCommand } from '../../commands/obsidian-export.js';
import { obsidianImportCommand } from '../../commands/obsidian-import.js';

/** Register the aurora_obsidian_export MCP tool. */
export function registerAuroraObsidianExportTool(server: McpServer): void {
  server.tool(
    'aurora_obsidian_export',
    'Export all Aurora knowledge graph nodes to an Obsidian vault as markdown files with frontmatter, wiki-links, speaker timelines, highlights, and comments.',
    {
      vault: z.string().optional().describe('Path to Obsidian vault (default: AURORA_OBSIDIAN_VAULT env or ~/Documents/Neuron Lab)'),
    },
    async (args) => {
      try {
        const result = await obsidianExportCommand({ vault: args.vault });
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ exported: result.exported }, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}

/** Register the aurora_obsidian_import MCP tool. */
export function registerAuroraObsidianImportTool(server: McpServer): void {
  server.tool(
    'aurora_obsidian_import',
    'Import tags, comments, highlights, and speaker names from Obsidian vault back into Aurora knowledge graph.',
    {
      vault: z.string().optional().describe('Path to Obsidian vault (default: AURORA_OBSIDIAN_VAULT env or ~/Documents/Neuron Lab)'),
    },
    async (args) => {
      try {
        const result = await obsidianImportCommand({ vault: args.vault });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                filesProcessed: result.filesProcessed,
                speakersRenamed: result.speakersRenamed,
                highlights: result.highlights,
                comments: result.comments,
              }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `Error: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    },
  );
}

/** Register both aurora_obsidian_export and aurora_obsidian_import tools. */
export function registerAuroraObsidianTools(server: McpServer): void {
  registerAuroraObsidianExportTool(server);
  registerAuroraObsidianImportTool(server);
}
