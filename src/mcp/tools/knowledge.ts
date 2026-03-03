import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  loadGraph,
  findNodes,
  traverse,
  type KGNode,
  type NodeType,
  type NodeScope,
} from '../../core/knowledge-graph.js';

/** Register the neuron_knowledge MCP tool on the given server. */
export function registerKnowledgeTool(server: McpServer): void {
  server.tool(
    'neuron_knowledge',
    'Search the Neuron HQ knowledge graph using keyword or semantic search',
    {
      query: z.string().describe('Search text (required)'),
      type: z
        .enum(['pattern', 'error', 'technique', 'run', 'agent'])
        .optional()
        .describe('Filter by node type'),
      scope: z
        .enum(['universal', 'project-specific'])
        .optional()
        .describe('Filter by scope'),
      semantic: z
        .boolean()
        .optional()
        .default(true)
        .describe('Use semantic search if available'),
      limit: z.number().optional().default(10).describe('Max results'),
    },
    async (args) => {
      try {
        let results: Array<Record<string, unknown>>;

        if (args.semantic) {
          try {
            const { semanticSearch } = await import(
              '../../core/semantic-search.js'
            );
            const semanticResults = await semanticSearch(args.query, {
              type: args.type,
              scope: args.scope,
              limit: args.limit,
            });

            // Load graph to get full node data + edges
            const graph = await loadGraph();
            results = semanticResults.map((sr) => {
              const fullNode = graph.nodes.find((n) => n.id === sr.id);
              let edges: KGNode[] = [];
              try {
                edges = traverse(graph, sr.id);
              } catch {
                /* node not in graph file */
              }
              return {
                node: fullNode ?? {
                  id: sr.id,
                  title: sr.title,
                  type: sr.type,
                  confidence: sr.confidence,
                  scope: sr.scope,
                },
                similarity: sr.similarity,
                edges: edges.map((e) => ({
                  id: e.id,
                  title: e.title,
                  type: e.type,
                })),
              };
            });
          } catch {
            // Semantic search unavailable, fall through to keyword
            results = await keywordSearch(args);
          }
        } else {
          results = await keywordSearch(args);
        }

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(results, null, 2) },
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

async function keywordSearch(args: {
  query: string;
  type?: string;
  scope?: string;
  limit?: number;
}): Promise<Array<Record<string, unknown>>> {
  const graph = await loadGraph();
  const nodes = findNodes(graph, {
    query: args.query,
    type: args.type as NodeType | undefined,
    scope: args.scope as NodeScope | undefined,
  });

  return nodes.slice(0, args.limit ?? 10).map((node) => {
    let edges: KGNode[] = [];
    try {
      edges = traverse(graph, node.id);
    } catch {
      /* */
    }
    return {
      node,
      edges: edges.map((e) => ({ id: e.id, title: e.title, type: e.type })),
    };
  });
}
