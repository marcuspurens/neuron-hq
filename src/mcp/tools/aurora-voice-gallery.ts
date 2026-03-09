import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { findAuroraNodes, loadAuroraGraph } from '../../aurora/aurora-graph.js';

/** Register aurora_voice_gallery MCP tool. */
export function registerAuroraVoiceGalleryTool(server: McpServer): void {
  server.tool(
    'aurora_voice_gallery',
    'List all voice prints in the Aurora knowledge base with speaker metadata.',
    {},
    async () => {
      try {
        const graph = await loadAuroraGraph();
        const voicePrints = findAuroraNodes(graph, { type: 'voice_print' });

        if (voicePrints.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'No voice prints found. Ingest a YouTube video with --diarize to create voice prints.',
              },
            ],
          };
        }

        const gallery = voicePrints.map((node) => ({
          id: node.id,
          title: node.title,
          speakerLabel: node.properties.speakerLabel,
          videoId: node.properties.videoId,
          segmentCount: node.properties.segmentCount,
          totalDurationMs: node.properties.totalDurationMs,
          confidence: node.confidence,
          created: node.created,
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { voicePrints: gallery, count: gallery.length },
                null,
                2,
              ),
            },
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
