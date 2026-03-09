import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { memoryStats } from '../../aurora/memory.js';

/** Register the aurora_memory_stats MCP tool on the given server. */
export function registerAuroraMemoryStatsTool(server: McpServer): void {
  server.tool(
    'aurora_memory_stats',
    'Get statistics about Aurora memory (facts, preferences, confidence scores).',
    {},
    async () => {
      try {
        const result = await memoryStats();
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
