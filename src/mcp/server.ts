import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerRunsTool } from './tools/runs.js';
import { registerKnowledgeTool } from './tools/knowledge.js';
import { registerCostsTool } from './tools/costs.js';
import { registerStartTool } from './tools/start.js';
import { registerAuroraStatusTool } from './tools/aurora-status.js';
import { registerAuroraSearchTool } from './tools/aurora-search.js';
import { registerAuroraIngestTools } from './tools/aurora-ingest.js';
import { registerAuroraAskTool } from './tools/aurora-ask.js';
import { registerAuroraRememberTool } from './tools/aurora-remember.js';
import { registerAuroraRecallTool } from './tools/aurora-recall.js';
import { registerAuroraMemoryStatsTool } from './tools/aurora-memory-stats.js';
import { registerAuroraIngestYouTubeTool } from './tools/aurora-ingest-youtube.js';
import { registerAuroraVoiceGalleryTool } from './tools/aurora-voice-gallery.js';
import { registerAuroraTimelineTool } from './tools/aurora-timeline.js';
import { registerAuroraGapsTool } from './tools/aurora-gaps.js';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'neuron-hq',
    version: '0.1.0',
  });

  registerRunsTool(server);
  registerKnowledgeTool(server);
  registerCostsTool(server);
  registerStartTool(server);
  registerAuroraStatusTool(server);
  registerAuroraSearchTool(server);
  registerAuroraIngestTools(server);
  registerAuroraAskTool(server);
  registerAuroraRememberTool(server);
  registerAuroraRecallTool(server);
  registerAuroraMemoryStatsTool(server);
  registerAuroraIngestYouTubeTool(server);
  registerAuroraVoiceGalleryTool(server);
  registerAuroraTimelineTool(server);
  registerAuroraGapsTool(server);

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
