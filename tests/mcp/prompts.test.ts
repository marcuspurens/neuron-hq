import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/* ---- Mock gray-matter (not installed, pulled in transitively via obsidian-parser) ---- */
vi.mock('gray-matter', () => ({
  default: () => ({ data: {}, content: '' }),
}));

/* ---- Mock all tool modules to prevent DB imports ---- */
vi.mock('../../src/mcp/tools/aurora-search.js', () => ({ registerAuroraSearchTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-ask.js', () => ({ registerAuroraAskTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-status.js', () => ({ registerAuroraStatusTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-timeline.js', () => ({ registerAuroraTimelineTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-briefing.js', () => ({ registerAuroraBriefingTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-suggest-research.js', () => ({ registerAuroraSuggestResearchTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-memory.js', () => ({ registerAuroraMemoryConsolidatedTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-learn-conversation.js', () => ({ registerAuroraLearnConversationTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-gaps.js', () => ({ registerAuroraGapsTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-ingest.js', () => ({ registerAuroraIngestUrlTool: vi.fn(), registerAuroraIngestDocTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-ingest-video.js', () => ({ registerAuroraIngestVideoTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-ingest-image.js', () => ({ registerAuroraIngestImageTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-ingest-book.js', () => ({ registerAuroraIngestBookTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-ocr-pdf.js', () => ({ registerAuroraOcrPdfTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-speakers.js', () => ({ registerAuroraSpeakersTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-jobs-consolidated.js', () => ({ registerAuroraJobsConsolidatedTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-ebucore-metadata.js', () => ({ registerAuroraEbucoreMetadataTool: vi.fn() }));
vi.mock('../../src/mcp/tools/knowledge-library.js', () => ({ registerKnowledgeLibraryTool: vi.fn() }));
vi.mock('../../src/mcp/tools/knowledge-manager.js', () => ({ registerKnowledgeManagerTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-freshness-consolidated.js', () => ({ registerAuroraFreshnessConsolidatedTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-cross-ref.js', () => ({ registerAuroraCrossRefConsolidatedTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-confidence.js', () => ({ registerAuroraConfidenceTool: vi.fn() }));
vi.mock('../../src/mcp/tools/aurora-check-deps.js', () => ({ registerAuroraCheckDepsTool: vi.fn() }));
vi.mock('../../src/mcp/tools/runs.js', () => ({ registerRunsTool: vi.fn() }));
vi.mock('../../src/mcp/tools/start.js', () => ({ registerStartTool: vi.fn() }));
vi.mock('../../src/mcp/tools/costs.js', () => ({ registerCostsTool: vi.fn() }));
vi.mock('../../src/mcp/tools/dashboard.js', () => ({ registerDashboardTool: vi.fn() }));
vi.mock('../../src/mcp/tools/run-statistics.js', () => ({ registerRunStatisticsTool: vi.fn() }));
vi.mock('../../src/mcp/tools/knowledge.js', () => ({ registerKnowledgeTool: vi.fn() }));
vi.mock('../../src/mcp/tools/crossref-lookup.js', () => ({ registerCrossRefLookupTool: vi.fn() }));

import { SCOPES } from '../../src/mcp/scopes.js';

/* ---- Types & helpers ---- */

type PromptEntry = {
  name: string;
  description?: string;
  argsSchema?: Record<string, unknown>;
  callback: Function;
};

/** Create a mock McpServer that captures .prompt() calls. */
function createMockServer(): { server: McpServer; prompts: PromptEntry[] } {
  const prompts: PromptEntry[] = [];

  const server = {
    tool: vi.fn(),
    prompt: vi.fn((...args: unknown[]) => {
      const name = args[0] as string;
      if (args.length === 2) {
        prompts.push({ name, callback: args[1] as Function });
      } else if (args.length === 3) {
        if (typeof args[1] === 'string') {
          prompts.push({ name, description: args[1] as string, callback: args[2] as Function });
        } else {
          prompts.push({ name, argsSchema: args[1] as Record<string, unknown>, callback: args[2] as Function });
        }
      } else if (args.length === 4) {
        prompts.push({
          name,
          description: args[1] as string,
          argsSchema: args[2] as Record<string, unknown>,
          callback: args[3] as Function,
        });
      }
    }),
  } as unknown as McpServer;

  return { server, prompts };
}

/** Validate that a prompt callback result has the expected message format. */
function validatePromptResult(result: unknown): void {
  const r = result as { messages: Array<{ role: string; content: { type: string; text: string } }> };
  expect(r.messages).toBeDefined();
  expect(r.messages.length).toBeGreaterThan(0);
  for (const msg of r.messages) {
    expect(msg.role).toBe('user');
    expect(msg.content.type).toBe('text');
    expect(typeof msg.content.text).toBe('string');
    expect(msg.content.text.length).toBeGreaterThan(0);
  }
}

/** Find a prompt by name in the captured list. */
function findPrompt(prompts: PromptEntry[], name: string): PromptEntry {
  const p = prompts.find((e) => e.name === name);
  if (!p) throw new Error(`Prompt "${name}" not found. Available: ${prompts.map((e) => e.name).join(', ')}`);
  return p;
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe('MCP Prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ---- Registration counts ---- */
  describe('registration counts', () => {
    const expectedCounts: Record<string, number> = {
      'aurora-search': 2,
      'aurora-insights': 2,
      'aurora-memory': 2,
      'aurora-ingest-text': 1,
      'aurora-ingest-media': 2,
      'aurora-media': 2,
      'aurora-library': 2,
      'aurora-quality': 2,
      'neuron-runs': 2,
      'neuron-analytics': 2,
    };

    for (const [scopeName, expectedCount] of Object.entries(expectedCounts)) {
      it(`${scopeName} registers ${expectedCount} prompt(s)`, () => {
        const { server, prompts } = createMockServer();
        SCOPES[scopeName].registerTools(server);
        expect(prompts).toHaveLength(expectedCount);
      });
    }
  });

  /* ---- aurora-search prompts ---- */
  describe('aurora-search prompts', () => {
    it('sok-och-svara returns messages containing the topic', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-search'].registerTools(server);
      const p = findPrompt(prompts, 'sok-och-svara');
      const result = p.callback({ topic: 'AI' });
      validatePromptResult(result);
      expect((result as any).messages[0].content.text).toContain('AI');
    });

    it('vad-vet-vi returns messages containing the topic', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-search'].registerTools(server);
      const p = findPrompt(prompts, 'vad-vet-vi');
      const result = p.callback({ topic: 'climate' });
      validatePromptResult(result);
      expect((result as any).messages[0].content.text).toContain('climate');
    });
  });

  /* ---- aurora-insights prompts ---- */
  describe('aurora-insights prompts', () => {
    it('full-briefing returns valid messages', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-insights'].registerTools(server);
      const p = findPrompt(prompts, 'full-briefing');
      const result = p.callback({ topic: 'quantum' });
      validatePromptResult(result);
    });

    it('forskningsforslag returns valid messages', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-insights'].registerTools(server);
      const p = findPrompt(prompts, 'forskningsforslag');
      const result = p.callback({ topic: 'physics' });
      validatePromptResult(result);
    });
  });

  /* ---- aurora-memory prompts ---- */
  describe('aurora-memory prompts', () => {
    it('vad-sa-vi returns valid messages', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-memory'].registerTools(server);
      const p = findPrompt(prompts, 'vad-sa-vi');
      const result = p.callback({ topic: 'meetings' });
      validatePromptResult(result);
    });

    it('lar-fran-samtal returns messages containing the conversation text', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-memory'].registerTools(server);
      const p = findPrompt(prompts, 'lar-fran-samtal');
      const result = p.callback({ conversation: 'User said hello' });
      validatePromptResult(result);
      expect((result as any).messages[0].content.text).toContain('User said hello');
    });
  });

  /* ---- aurora-ingest-text prompts ---- */
  describe('aurora-ingest-text prompts', () => {
    it('indexera-lank returns messages containing the URL', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-ingest-text'].registerTools(server);
      const p = findPrompt(prompts, 'indexera-lank');
      const result = p.callback({ url: 'https://example.com' });
      validatePromptResult(result);
      expect((result as any).messages[0].content.text).toContain('https://example.com');
    });
  });

  /* ---- aurora-ingest-media prompts ---- */
  describe('aurora-ingest-media prompts', () => {
    it('indexera-video returns valid messages', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-ingest-media'].registerTools(server);
      const p = findPrompt(prompts, 'indexera-video');
      const result = p.callback({ url: 'https://youtube.com/watch?v=abc' });
      validatePromptResult(result);
    });

    it('indexera-bilder returns messages containing the path', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-ingest-media'].registerTools(server);
      const p = findPrompt(prompts, 'indexera-bilder');
      const result = p.callback({ path: '/tmp/photos' });
      validatePromptResult(result);
      expect((result as any).messages[0].content.text).toContain('/tmp/photos');
    });
  });

  /* ---- aurora-media prompts ---- */
  describe('aurora-media prompts', () => {
    it('speaker-review returns valid messages with no args', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-media'].registerTools(server);
      const p = findPrompt(prompts, 'speaker-review');
      const result = p.callback();
      validatePromptResult(result);
    });

    it('jobb-oversikt returns valid messages with no args', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-media'].registerTools(server);
      const p = findPrompt(prompts, 'jobb-oversikt');
      const result = p.callback();
      validatePromptResult(result);
    });
  });

  /* ---- aurora-library prompts ---- */
  describe('aurora-library prompts', () => {
    it('ny-artikel returns valid messages', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-library'].registerTools(server);
      const p = findPrompt(prompts, 'ny-artikel');
      const result = p.callback({ topic: 'TypeScript' });
      validatePromptResult(result);
    });

    it('kunskapsbibliotek returns valid messages with no args', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-library'].registerTools(server);
      const p = findPrompt(prompts, 'kunskapsbibliotek');
      const result = p.callback();
      validatePromptResult(result);
    });
  });

  /* ---- aurora-quality prompts ---- */
  describe('aurora-quality prompts', () => {
    it('kvalitetsrapport returns valid messages with no args', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-quality'].registerTools(server);
      const p = findPrompt(prompts, 'kvalitetsrapport');
      const result = p.callback();
      validatePromptResult(result);
    });

    it('verifiera-kallor returns valid messages', () => {
      const { server, prompts } = createMockServer();
      SCOPES['aurora-quality'].registerTools(server);
      const p = findPrompt(prompts, 'verifiera-kallor');
      const result = p.callback({ topic: 'migration' });
      validatePromptResult(result);
    });
  });

  /* ---- neuron-runs prompts ---- */
  describe('neuron-runs prompts', () => {
    it('senaste-korningar returns messages containing the count', () => {
      const { server, prompts } = createMockServer();
      SCOPES['neuron-runs'].registerTools(server);
      const p = findPrompt(prompts, 'senaste-korningar');
      const result = p.callback({ count: 10 });
      validatePromptResult(result);
      expect((result as any).messages[0].content.text).toContain('10');
    });

    it('starta-korning returns messages containing target and brief', () => {
      const { server, prompts } = createMockServer();
      SCOPES['neuron-runs'].registerTools(server);
      const p = findPrompt(prompts, 'starta-korning');
      const result = p.callback({ target: 'neuron-hq', brief: 'Fix tests' });
      validatePromptResult(result);
      const text = (result as any).messages[0].content.text;
      expect(text).toContain('neuron-hq');
      expect(text).toContain('Fix tests');
    });
  });

  /* ---- neuron-analytics prompts ---- */
  describe('neuron-analytics prompts', () => {
    it('dashboard returns valid messages with no args', () => {
      const { server, prompts } = createMockServer();
      SCOPES['neuron-analytics'].registerTools(server);
      const p = findPrompt(prompts, 'dashboard');
      const result = p.callback();
      validatePromptResult(result);
    });

    it('beliefs returns valid messages', () => {
      const { server, prompts } = createMockServer();
      SCOPES['neuron-analytics'].registerTools(server);
      const p = findPrompt(prompts, 'beliefs');
      const result = p.callback({ topic: 'performance' });
      validatePromptResult(result);
    });
  });
});
