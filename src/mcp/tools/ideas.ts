import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  loadGraph,
  saveGraph,
  rankIdeas,
  linkRelatedIdeas,
  updateNode,
  addNode,
  addEdge,
  computePriority,
} from '../../core/knowledge-graph.js';
import { createLogger } from '../../core/logger.js';
import path from 'path';

const logger = createLogger('mcp:ideas');
const DEFAULT_GRAPH_PATH = path.resolve(process.cwd(), 'memory', 'graph.json');

export function registerIdeasTool(server: McpServer): void {
  server.tool(
    'neuron_ideas',
    'Manage and rank ideas in the Neuron knowledge graph',
    {
      action: z.enum(['rank', 'link', 'update', 'consolidate']).describe('Action to perform'),
      // For rank action:
      status: z.string().optional().describe('Comma-separated statuses to filter (default: proposed,accepted)'),
      group: z.string().optional().describe('Filter by group name'),
      limit: z.number().optional().default(10).describe('Max results for ranking'),
      minImpact: z.number().optional().describe('Minimum impact score (1-5)'),
      // For update action:
      nodeId: z.string().optional().describe('Node ID to update (for update action)'),
      impact: z.number().int().min(1).max(5).optional().describe('New impact score'),
      effort: z.number().int().min(1).max(5).optional().describe('New effort score'),
      risk: z.number().int().min(1).max(5).optional().describe('New risk score'),
      newStatus: z.string().optional().describe('New status for the idea'),
      // For consolidate action:
      threshold: z.number().optional().default(0.3).describe('Jaccard similarity threshold for consolidation'),
      minClusterSize: z.number().optional().default(3).describe('Minimum cluster size for consolidation'),
      dryRun: z.boolean().optional().default(true).describe('If true, do not mutate graph (default: true)'),
    },
    async (args) => {
      try {
        let graph = await loadGraph(DEFAULT_GRAPH_PATH);

        switch (args.action) {
          case 'rank': {
            const statusFilter = args.status
              ? args.status.split(',').map(s => s.trim())
              : ['proposed', 'accepted'];
            const ranked = rankIdeas(graph, {
              status: statusFilter,
              group: args.group,
              limit: args.limit,
              minImpact: args.minImpact,
            });
            const results = ranked.map((node, i) => ({
              rank: i + 1,
              id: node.id,
              title: node.title,
              impact: node.properties.impact,
              effort: node.properties.effort,
              risk: node.properties.risk,
              priority: node.properties.priority,
              status: node.properties.status,
              group: node.properties.group,
              edges: graph.edges.filter(e => e.from === node.id || e.to === node.id).length,
            }));
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
            };
          }

          case 'link': {
            const before = graph.edges.length;
            graph = linkRelatedIdeas(graph);
            const added = graph.edges.length - before;
            await saveGraph(graph, DEFAULT_GRAPH_PATH);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ linked: true, edgesAdded: added, totalEdges: graph.edges.length }),
              }],
            };
          }

          case 'update': {
            if (!args.nodeId) {
              return {
                content: [{ type: 'text' as const, text: 'Error: nodeId is required for update action' }],
                isError: true,
              };
            }
            const node = graph.nodes.find(n => n.id === args.nodeId);
            if (!node || node.type !== 'idea') {
              return {
                content: [{ type: 'text' as const, text: `Error: Idea node '${args.nodeId}' not found` }],
                isError: true,
              };
            }
            const updatedProps = { ...node.properties };
            if (args.impact !== undefined) updatedProps.impact = args.impact;
            if (args.effort !== undefined) updatedProps.effort = args.effort;
            if (args.risk !== undefined) updatedProps.risk = args.risk;
            if (args.newStatus !== undefined) updatedProps.status = args.newStatus;
            // Recompute priority
            const imp = (updatedProps.impact as number) || 3;
            const eff = (updatedProps.effort as number) || 3;
            const rsk = (updatedProps.risk as number) || 3;
            updatedProps.priority = computePriority(imp, eff, rsk);
            graph = updateNode(graph, args.nodeId, { properties: updatedProps });
            await saveGraph(graph, DEFAULT_GRAPH_PATH);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  updated: true,
                  nodeId: args.nodeId,
                  impact: updatedProps.impact,
                  effort: updatedProps.effort,
                  risk: updatedProps.risk,
                  priority: updatedProps.priority,
                  status: updatedProps.status,
                }),
              }],
            };
          }

          case 'consolidate': {
            const { clusterIdeas, createMetaIdeas } = await import('../../core/idea-clusters.js');
            const result = clusterIdeas(graph, {
              similarityThreshold: args.threshold,
              minClusterSize: args.minClusterSize,
            });

            if (!args.dryRun) {
              const { newNodes, newEdges } = createMetaIdeas(graph, result.clusters);
              for (const node of newNodes) {
                graph = addNode(graph, node);
              }
              for (const edge of newEdges) {
                graph = addEdge(graph, edge);
              }
              // Archive candidates
              for (const id of result.archived) {
                const node = graph.nodes.find(n => n.id === id);
                if (node) {
                  graph = updateNode(graph, id, {
                    confidence: 0.05,
                    properties: {
                      ...node.properties,
                      archived: true,
                      status: 'rejected',
                    },
                  });
                }
              }
              await saveGraph(graph, DEFAULT_GRAPH_PATH);
            }

            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
          }

          default:
            return {
              content: [{ type: 'text' as const, text: `Unknown action: ${args.action}` }],
              isError: true,
            };
        }
      } catch (err) {
        logger.error('neuron_ideas error', { error: String(err) });
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
