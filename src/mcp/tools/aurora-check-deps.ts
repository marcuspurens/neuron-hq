import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runWorker } from '../../aurora/worker-bridge.js';

/** Register the aurora_check_deps MCP tool on the given server. */
export function registerAuroraCheckDepsTool(server: McpServer): void {
  server.tool(
    'aurora_check_deps',
    'Check which Python dependencies and Whisper models are available for Aurora workers',
    {
      preload_models: z.boolean().optional().default(false)
        .describe('Also try loading Whisper models (slow on first run)'),
    },
    async (args) => {
      try {
        const result = await runWorker({
          action: 'check_deps',
          source: '',
          options: { preload_models: args.preload_models },
        });
        if (!result.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: ${result.error}`,
            }],
            isError: true,
          };
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
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
