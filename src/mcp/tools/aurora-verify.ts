import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { verifySource } from '../../aurora/freshness.js';

/** Register the aurora_verify_source MCP tool on the given server. */
export function registerAuroraVerifyTool(server: McpServer): void {
  server.tool(
    'aurora_verify_source',
    'Mark an Aurora source node as verified (updates last_verified timestamp)',
    {
      node_id: z.string().min(1).describe('The Aurora node ID to verify'),
    },
    async (args) => {
      try {
        const updated = await verifySource(args.node_id);
        return {
          content: [{
            type: 'text' as const,
            text: updated
              ? `Source ${args.node_id} marked as verified`
              : `Node ${args.node_id} not found`,
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
