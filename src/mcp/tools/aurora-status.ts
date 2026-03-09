import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPool, isDbAvailable } from '../../core/db.js';

/** Register the aurora_status MCP tool on the given server. */
export function registerAuroraStatusTool(server: McpServer): void {
  server.tool(
    'aurora_status',
    'Get Aurora knowledge graph statistics - node counts, edge counts, embedding coverage, confidence distribution',
    {},
    async () => {
      try {
        const dbAvailable = await isDbAvailable();
        if (!dbAvailable) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  totalNodes: 0,
                  totalEdges: 0,
                  nodesByType: {},
                  edgesByType: {},
                  embeddingCoverage: { withEmbedding: 0, total: 0 },
                  latestNode: null,
                  confidenceDistribution: { stale: 0, active: 0 },
                }, null, 2),
              },
            ],
          };
        }

        const pool = getPool();

        // Node counts by type
        const { rows: nodeCounts } = await pool.query(
          `SELECT type, COUNT(*)::int as count FROM aurora_nodes GROUP BY type ORDER BY type`,
        );
        const nodesByType: Record<string, number> = {};
        let totalNodes = 0;
        for (const row of nodeCounts) {
          nodesByType[row.type as string] = Number(row.count);
          totalNodes += Number(row.count);
        }

        // Edge counts by type
        const { rows: edgeCounts } = await pool.query(
          `SELECT type, COUNT(*)::int as count FROM aurora_edges GROUP BY type ORDER BY type`,
        );
        const edgesByType: Record<string, number> = {};
        let totalEdges = 0;
        for (const row of edgeCounts) {
          edgesByType[row.type as string] = Number(row.count);
          totalEdges += Number(row.count);
        }

        // Embedding coverage
        const { rows: embedRows } = await pool.query(
          `SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int as with_embedding, COUNT(*)::int as total FROM aurora_nodes`,
        );

        // Latest node
        const { rows: latestRows } = await pool.query(
          `SELECT title, created FROM aurora_nodes ORDER BY created DESC LIMIT 1`,
        );

        // Confidence distribution
        const { rows: confRows } = await pool.query(
          `SELECT 
            COUNT(*) FILTER (WHERE confidence < 0.1)::int as stale,
            COUNT(*) FILTER (WHERE confidence >= 0.5)::int as active
           FROM aurora_nodes`,
        );

        const result = {
          totalNodes,
          totalEdges,
          nodesByType,
          edgesByType,
          embeddingCoverage: {
            withEmbedding: Number(embedRows[0]?.with_embedding ?? 0),
            total: Number(embedRows[0]?.total ?? 0),
          },
          latestNode: latestRows.length > 0
            ? { title: latestRows[0].title, created: latestRows[0].created }
            : null,
          confidenceDistribution: {
            stale: Number(confRows[0]?.stale ?? 0),
            active: Number(confRows[0]?.active ?? 0),
          },
        };

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
