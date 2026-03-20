import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/* ---- aurora-search ---- */
import { registerAuroraSearchTool } from './tools/aurora-search.js';
import { registerAuroraAskTool } from './tools/aurora-ask.js';
import { registerAuroraStatusTool } from './tools/aurora-status.js';

/* ---- aurora-insights ---- */
import { registerAuroraTimelineTool } from './tools/aurora-timeline.js';
import { registerAuroraBriefingTool } from './tools/aurora-briefing.js';
import { registerAuroraSuggestResearchTool } from './tools/aurora-suggest-research.js';
import { registerAuroraMorningBriefingTool } from './tools/aurora-morning-briefing.js';

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
import { registerAuroraDescribeImageTool } from './tools/aurora-describe-image.js';

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

/* ---- aurora-obsidian ---- */
import { registerAuroraObsidianTools } from './tools/aurora-obsidian.js';

/* ---- neuron-runs ---- */
import { registerRunsTool } from './tools/runs.js';
import { registerStartTool } from './tools/start.js';
import { registerCostsTool } from './tools/costs.js';

/* ---- neuron-analytics ---- */
import { registerDashboardTool } from './tools/dashboard.js';
import { registerRunStatisticsTool } from './tools/run-statistics.js';
import { registerKnowledgeTool } from './tools/knowledge.js';
import { registerCrossRefLookupTool } from './tools/crossref-lookup.js';
import { registerIdeasTool } from './tools/ideas.js';
import { registerNeuronHelpTool } from './tools/neuron-help.js';

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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Build a single-message user prompt result. */
function userPrompt(text: string) {
  return {
    messages: [
      {
        role: 'user' as const,
        content: { type: 'text' as const, text },
      },
    ],
  };
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

      server.prompt(
        'sok-och-svara',
        'Sök i Aurora och ge ett syntetiserat svar med källor',
        { topic: z.string().describe('Ämne att söka efter') },
        (args) =>
          userPrompt(
            `Sök i Aurora efter "${args.topic}" med aurora_search, och ge mig sedan ett syntetiserat svar med aurora_ask. Inkludera källor och confidence-nivåer.`,
          ),
      );

      server.prompt(
        'vad-vet-vi',
        'Visa Aurora-status, sök efter ämne och sammanfatta kunskapsläget',
        { topic: z.string().describe('Ämne att undersöka') },
        (args) =>
          userPrompt(
            `Börja med att visa Aurora-status med aurora_status. Sök sedan efter "${args.topic}" med aurora_search och sammanfatta vad vi vet. Ange eventuella kunskapsluckor.`,
          ),
      );
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
      registerAuroraMorningBriefingTool(server);

      server.prompt(
        'full-briefing',
        'Skapa tidslinje, briefing och forskningsförslag för ett ämne',
        { topic: z.string().describe('Ämne för briefing') },
        (args) =>
          userPrompt(
            `Skapa en tidslinje för "${args.topic}" med aurora_timeline, generera en briefing med aurora_briefing, och föreslå vidare forskning med aurora_suggest_research.`,
          ),
      );

      server.prompt(
        'forskningsforslag',
        'Analysera kunskapsluckor och generera forskningsförslag',
        { topic: z.string().describe('Ämne att analysera') },
        (args) =>
          userPrompt(
            `Analysera kunskapsluckor kring "${args.topic}" och generera forskningsförslag med aurora_suggest_research. Inkludera prioritering och motivering.`,
          ),
      );
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

      server.prompt(
        'vad-sa-vi',
        'Hämta minnen om ett ämne och visa kunskapsluckor',
        { topic: z.string().describe('Ämne att minnas') },
        (args) =>
          userPrompt(
            `Hämta relevanta minnen om "${args.topic}" med aurora_memory (action: recall). Lista sedan eventuella kunskapsluckor med aurora_gaps.`,
          ),
      );

      server.prompt(
        'lar-fran-samtal',
        'Extrahera fakta från en konversation och spara till minnet',
        { conversation: z.string().describe('Konversationstext att lära från') },
        (args) =>
          userPrompt(
            `Extrahera fakta och preferenser från följande konversation och spara till minnet med aurora_learn_conversation:\n\n${args.conversation}`,
          ),
      );
    },
  },

  'aurora-ingest-text': {
    name: 'aurora-ingest-text',
    description:
      'Ingest text content into Aurora — URLs and documents.',
    registerTools(server: McpServer): void {
      registerAuroraIngestUrlTool(server);
      registerAuroraIngestDocTool(server);

      server.prompt(
        'indexera-lank',
        'Indexera en URL i Aurora och visa extraherat innehåll',
        { url: z.string().describe('URL att indexera') },
        (args) =>
          userPrompt(
            `Indexera innehållet från ${args.url} i Aurora med aurora_ingest_url. Visa vad som extraherades och bekräfta att det sparades korrekt.`,
          ),
      );
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
      registerAuroraDescribeImageTool(server);

      server.prompt(
        'indexera-video',
        'Köa en video för indexering och förklara processen',
        { url: z.string().describe('Video-URL att indexera') },
        (args) =>
          userPrompt(
            `Köa ${args.url} för videoindexering med aurora_ingest_video. Förklara vad som kommer att hända: nedladdning, transkription, chunkning och korsreferering.`,
          ),
      );

      server.prompt(
        'indexera-bilder',
        'Indexera bilder med OCR och beskriv extraherat innehåll',
        { path: z.string().describe('Sökväg till bild(er)') },
        (args) =>
          userPrompt(
            `Indexera bild(er) från ${args.path} med aurora_ingest_image. Använd OCR om tillämpligt och beskriv vad som extraherades.`,
          ),
      );
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

      server.prompt(
        'speaker-review',
        'Lista röstavtryck och föreslå matchningar mellan speakers',
        () =>
          userPrompt(
            'Lista alla röstavtryck med aurora_speakers (action: list). Föreslå matchningar mellan speakers och visa vilka som behöver bekräftelse.',
          ),
      );

      server.prompt(
        'jobb-oversikt',
        'Visa alla senaste jobb med status och statistik',
        () =>
          userPrompt(
            'Visa alla senaste jobb med aurora_jobs (action: list). Inkludera status, statistik och eventuella färdiga notifikationer.',
          ),
      );
    },
  },

  'aurora-library': {
    name: 'aurora-library',
    description:
      'Knowledge library browsing and knowledge-manager chain operations.',
    registerTools(server: McpServer): void {
      registerKnowledgeLibraryTool(server);
      registerKnowledgeManagerTool(server);

      server.prompt(
        'ny-artikel',
        'Syntetisera en ny artikel från Aurora-kunskapsbasen',
        { topic: z.string().describe('Ämne för artikeln') },
        (args) =>
          userPrompt(
            `Syntetisera en ny artikel om "${args.topic}" från Aurora-kunskapsbasen med knowledge_manager (action: create). Basera på befintlig kunskap och ange källor.`,
          ),
      );

      server.prompt(
        'kunskapsbibliotek',
        'Lista alla artiklar med ontologi-statistik och föreslå sammanslagningar',
        () =>
          userPrompt(
            'Lista alla artiklar med knowledge_library (action: list). Visa ontologi-statistik och föreslå eventuella konceptsammanslagningar.',
          ),
      );
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

      server.prompt(
        'kvalitetsrapport',
        'Kör färskhetsrapport, kontrollera korsreferenser och visa låg-confidence-noder',
        () =>
          userPrompt(
            'Kör en färskhetsrapport med aurora_freshness (action: report). Kontrollera korsreferensintegritet med aurora_cross_ref (action: check). Visa noder med låg confidence via aurora_confidence.',
          ),
      );

      server.prompt(
        'verifiera-kallor',
        'Hitta och verifiera källors färskhetsstatus för ett ämne',
        { topic: z.string().describe('Ämne att verifiera') },
        (args) =>
          userPrompt(
            `Hitta källor om "${args.topic}" med aurora_freshness (action: check). Kontrollera deras färskhetsstatus och rapportera eventuella problem.`,
          ),
      );
    },
  },

  'aurora-obsidian': {
    name: 'aurora-obsidian',
    description:
      'Obsidian vault integration — export Aurora nodes and import annotations.',
    registerTools(server: McpServer): void {
      registerAuroraObsidianTools(server);
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

      server.prompt(
        'senaste-korningar',
        'Visa de senaste körningarna med status, kostnader och testresultat',
        { count: z.number().default(5).describe('Antal körningar att visa') },
        (args) =>
          userPrompt(
            `Visa de senaste ${args.count} körningarna med neuron_runs. Inkludera status, kostnader och testresultat. Sammanfatta med neuron_costs.`,
          ),
      );

      server.prompt(
        'starta-korning',
        'Förbered och starta en körning med kostnadsuppskattning',
        {
          target: z.string().describe('Mål-repo'),
          brief: z.string().describe('Brief-beskrivning'),
        },
        (args) =>
          userPrompt(
            `Förbered att starta en körning för ${args.target} med briefen: "${args.brief}". Visa en kostnadsuppskattning med neuron_costs innan start med neuron_start.`,
          ),
      );
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
      registerIdeasTool(server);
      registerNeuronHelpTool(server);

      server.prompt(
        'dashboard',
        'Generera fullständig dashboard med beliefs, körningsstatistik och kunskapsöversikt',
        () =>
          userPrompt(
            'Generera den fullständiga dashboarden med neuron_dashboard. Inkludera beliefs, körningsstatistik och kunskapsöversikt via neuron_run_statistics och neuron_knowledge.',
          ),
      );

      server.prompt(
        'beliefs',
        'Visa Bayesianska beliefs och statistik för ett ämne',
        { topic: z.string().describe('Ämne för beliefs') },
        (args) =>
          userPrompt(
            `Visa Bayesianska beliefs och statistik relaterade till "${args.topic}" med neuron_knowledge. Inkludera confidence-nivåer och eventuella motsägelser.`,
          ),
      );
    },
  },
};
