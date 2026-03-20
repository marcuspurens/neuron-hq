import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadGraph, pprQuery, type NodeType } from '../../core/knowledge-graph.js';
import { createLogger } from '../../core/logger.js';

const logger = createLogger('mcp:graph-ppr');

/** Register the graph_ppr MCP tool on the given server. */
export function registerGraphPprTool(server: McpServer): void {
  server.tool(
    'graph_ppr',
    'Find related nodes using graph structure (Personalized PageRank). Starts from seed nodes and walks the graph — finds connections that keyword search misses.',
    {
      seed_ids: z.array(z.string()).min(1).describe('Node IDs to start from (at least 1)'),
      limit: z.number().optional().default(10).describe('Max results (default 10)'),
      type: z.enum(['pattern', 'error', 'technique', 'run', 'agent', 'idea']).optional().describe('Filter result type'),
      min_score: z.number().optional().default(0.01).describe('Minimum PPR score threshold'),
    },
    async (args) => {
      try {
        const graph = await loadGraph();
        const results = pprQuery(graph, args.seed_ids, {
          limit: args.type ? (args.limit ?? 10) * 3 : args.limit,
          minScore: args.min_score,
        });

        const filtered = args.type ? results.filter(r => r.node.type === (args.type as NodeType)) : results;
        const limited = filtered.slice(0, args.limit ?? 10);

        const output = limited.map(r => ({
          id: r.node.id,
          title: r.node.title,
          type: r.node.type,
          score: r.score,
          confidence: r.node.confidence,
        }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error('graph_ppr failed', { error: message });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
        };
      }
    },
  );
}
