import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadAuroraGraph, findAuroraNodes } from '../../aurora/aurora-graph.js';
import {
  getEbucoreMetadata,
  validateEbucoreCompleteness,
  getAppliedStandards,
  metadataCoverageReport,
} from '../../aurora/ebucore-metadata.js';

/** Register the aurora_ebucore_metadata MCP tool on the given server. */
export function registerAuroraEbucoreMetadataTool(server: McpServer): void {
  server.tool(
    'aurora_ebucore_metadata',
    'EBUCore metadata for Aurora multimedia nodes. Actions: ebucore_metadata (get metadata for a node), metadata_coverage (coverage report).',
    {
      action: z.enum(['ebucore_metadata', 'metadata_coverage']),
      nodeId: z.string().optional().describe('Node ID (required for ebucore_metadata action)'),
    },
    async (args) => {
      try {
        const graph = await loadAuroraGraph();

        switch (args.action) {
          case 'ebucore_metadata': {
            if (!args.nodeId) {
              throw new Error('nodeId required for ebucore_metadata action');
            }
            const node = graph.nodes.find((n) => n.id === args.nodeId);
            if (!node) {
              throw new Error(`Node not found: ${args.nodeId}`);
            }
            const metadata = getEbucoreMetadata(node);
            const validation = validateEbucoreCompleteness(node);
            const standards = getAppliedStandards(node.type);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ metadata, validation, standards }, null, 2),
              }],
            };
          }
          case 'metadata_coverage': {
            const nodes = findAuroraNodes(graph, {});
            const report = metadataCoverageReport(nodes);
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify(report, null, 2),
              }],
            };
          }
        }
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
