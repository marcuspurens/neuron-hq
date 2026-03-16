import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/* ---- aurora-search ---- */
import { registerAuroraSearchTool } from './tools/aurora-search.js';
import { registerAuroraAskTool } from './tools/aurora-ask.js';
import { registerAuroraStatusTool } from './tools/aurora-status.js';

/* ---- aurora-insights ---- */
import { registerAuroraTimelineTool } from './tools/aurora-timeline.js';
import { registerAuroraBriefingTool } from './tools/aurora-briefing.js';
import { registerAuroraSuggestResearchTool } from './tools/aurora-suggest-research.js';

/* ---- aurora-memory (consolidated) ---- */
import { registerAuroraMemoryConsolidatedTool } from './tools/aurora-memory.js';
import { registerAuroraLearnConversationTool } from './tools/aurora-learn-conversation.js';
import { registerAuroraGapsTool } from './tools/aurora-gaps.js';

/* ---- aurora-ingest-text ---- */
import {
  registerAuroraIngestUrlTool,
  registerAuroraIngestDocTool,
} from './tools/aurora-ingest.js';

/* ---- aurora-ingest-media ---- */
import { registerAuroraIngestVideoTool } from './tools/aurora-ingest-video.js';
import { registerAuroraIngestImageTool } from './tools/aurora-ingest-image.js';
import { registerAuroraIngestBookTool } from './tools/aurora-ingest-book.js';
import { registerAuroraOcrPdfTool } from './tools/aurora-ocr-pdf.js';

/* ---- aurora-media (consolidated speakers + jobs) ---- */
import { registerAuroraSpeakersTool } from './tools/aurora-speakers.js';
import { registerAuroraJobsConsolidatedTool } from './tools/aurora-jobs-consolidated.js';
import { registerAuroraEbucoreMetadataTool } from './tools/aurora-ebucore-metadata.js';

/* ---- aurora-library ---- */
import { registerKnowledgeLibraryTool } from './tools/knowledge-library.js';
import { registerKnowledgeManagerTool } from './tools/knowledge-manager.js';

/* ---- aurora-quality (consolidated freshness + cross-ref) ---- */
import { registerAuroraFreshnessConsolidatedTool } from './tools/aurora-freshness-consolidated.js';
import { registerAuroraCrossRefConsolidatedTool } from './tools/aurora-cross-ref.js';
import { registerAuroraConfidenceTool } from './tools/aurora-confidence.js';
import { registerAuroraCheckDepsTool } from './tools/aurora-check-deps.js';

/* ---- neuron-runs ---- */
import { registerRunsTool } from './tools/runs.js';
import { registerStartTool } from './tools/start.js';
import { registerCostsTool } from './tools/costs.js';

/* ---- neuron-analytics ---- */
import { registerDashboardTool } from './tools/dashboard.js';
import { registerRunStatisticsTool } from './tools/run-statistics.js';
import { registerKnowledgeTool } from './tools/knowledge.js';
import { registerCrossRefLookupTool } from './tools/crossref-lookup.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A named group of MCP tools that can be registered together. */
export interface ServerScope {
  name: string;
  description: string;
  registerTools: (server: McpServer) => void;
}

/* ------------------------------------------------------------------ */
/*  Scope registry                                                     */
/* ------------------------------------------------------------------ */

export const SCOPES: Record<string, ServerScope> = {
  'aurora-search': {
    name: 'aurora-search',
    description:
      'Full-text and semantic search across the Aurora knowledge graph, Q&A, and system status.',
    registerTools(server: McpServer): void {
      registerAuroraSearchTool(server);
      registerAuroraAskTool(server);
      registerAuroraStatusTool(server);
    },
  },

  'aurora-insights': {
    name: 'aurora-insights',
    description:
      'Timeline analysis, daily briefings, and research suggestions from Aurora data.',
    registerTools(server: McpServer): void {
      registerAuroraTimelineTool(server);
      registerAuroraBriefingTool(server);
      registerAuroraSuggestResearchTool(server);
    },
  },

  'aurora-memory': {
    name: 'aurora-memory',
    description:
      'Persistent memory operations — remember, recall, stats, conversation learning, and knowledge gap detection.',
    registerTools(server: McpServer): void {
      registerAuroraMemoryConsolidatedTool(server);
      registerAuroraLearnConversationTool(server);
      registerAuroraGapsTool(server);
    },
  },

  'aurora-ingest-text': {
    name: 'aurora-ingest-text',
    description:
      'Ingest text content into Aurora — URLs and documents.',
    registerTools(server: McpServer): void {
      registerAuroraIngestUrlTool(server);
      registerAuroraIngestDocTool(server);
    },
  },

  'aurora-ingest-media': {
    name: 'aurora-ingest-media',
    description:
      'Ingest rich media into Aurora — videos, images, books, and OCR for PDFs.',
    registerTools(server: McpServer): void {
      registerAuroraIngestVideoTool(server);
      registerAuroraIngestImageTool(server);
      registerAuroraIngestBookTool(server);
      registerAuroraOcrPdfTool(server);
    },
  },

  'aurora-media': {
    name: 'aurora-media',
    description:
      'Speaker management, job management, and EBUCore metadata for media assets.',
    registerTools(server: McpServer): void {
      registerAuroraSpeakersTool(server);
      registerAuroraJobsConsolidatedTool(server);
      registerAuroraEbucoreMetadataTool(server);
    },
  },

  'aurora-library': {
    name: 'aurora-library',
    description:
      'Knowledge library browsing and knowledge-manager chain operations.',
    registerTools(server: McpServer): void {
      registerKnowledgeLibraryTool(server);
      registerKnowledgeManagerTool(server);
    },
  },

  'aurora-quality': {
    name: 'aurora-quality',
    description:
      'Source freshness checks, cross-reference integrity, confidence scoring, and dependency validation.',
    registerTools(server: McpServer): void {
      registerAuroraFreshnessConsolidatedTool(server);
      registerAuroraCrossRefConsolidatedTool(server);
      registerAuroraConfidenceTool(server);
      registerAuroraCheckDepsTool(server);
    },
  },

  'neuron-runs': {
    name: 'neuron-runs',
    description:
      'Manage Neuron agent runs — list, start, and track costs.',
    registerTools(server: McpServer): void {
      registerRunsTool(server);
      registerStartTool(server);
      registerCostsTool(server);
    },
  },

  'neuron-analytics': {
    name: 'neuron-analytics',
    description:
      'Analytics dashboard, run statistics, knowledge graph queries, and CrossRef lookups.',
    registerTools(server: McpServer): void {
      registerDashboardTool(server);
      registerRunStatisticsTool(server);
      registerKnowledgeTool(server);
      registerCrossRefLookupTool(server);
    },
  },
};
