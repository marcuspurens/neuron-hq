import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ---- Mock every tool registration import (using src paths) ---- */
/* Consolidated tools that only exist on other branches need mocking */
vi.mock('../../src/mcp/tools/aurora-memory.js', () => ({
  registerAuroraMemoryConsolidatedTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-speakers.js', () => ({
  registerAuroraSpeakersTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-jobs-consolidated.js', () => ({
  registerAuroraJobsConsolidatedTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-freshness-consolidated.js', () => ({
  registerAuroraFreshnessConsolidatedTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-cross-ref.js', () => ({
  registerAuroraCrossRefConsolidatedTool: vi.fn(),
}));
/* aurora-ingest.ts exists but the split exports (Url/Doc) are on T6 branch */
vi.mock('../../src/mcp/tools/aurora-ingest.js', () => ({
  registerAuroraIngestUrlTool: vi.fn(),
  registerAuroraIngestDocTool: vi.fn(),
}));

/* Existing tools — mock to avoid pulling in real dependencies */
vi.mock('../../src/mcp/tools/aurora-search.js', () => ({
  registerAuroraSearchTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-ask.js', () => ({
  registerAuroraAskTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-status.js', () => ({
  registerAuroraStatusTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-timeline.js', () => ({
  registerAuroraTimelineTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-briefing.js', () => ({
  registerAuroraBriefingTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-suggest-research.js', () => ({
  registerAuroraSuggestResearchTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-learn-conversation.js', () => ({
  registerAuroraLearnConversationTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-gaps.js', () => ({
  registerAuroraGapsTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-ingest-video.js', () => ({
  registerAuroraIngestVideoTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-ingest-image.js', () => ({
  registerAuroraIngestImageTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-ingest-book.js', () => ({
  registerAuroraIngestBookTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-ocr-pdf.js', () => ({
  registerAuroraOcrPdfTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-describe-image.js', () => ({
  registerAuroraDescribeImageTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-ebucore-metadata.js', () => ({
  registerAuroraEbucoreMetadataTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/knowledge-library.js', () => ({
  registerKnowledgeLibraryTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/knowledge-manager.js', () => ({
  registerKnowledgeManagerTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-confidence.js', () => ({
  registerAuroraConfidenceTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/aurora-check-deps.js', () => ({
  registerAuroraCheckDepsTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/runs.js', () => ({
  registerRunsTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/start.js', () => ({
  registerStartTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/costs.js', () => ({
  registerCostsTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/dashboard.js', () => ({
  registerDashboardTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/run-statistics.js', () => ({
  registerRunStatisticsTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/knowledge.js', () => ({
  registerKnowledgeTool: vi.fn(),
}));
vi.mock('../../src/mcp/tools/crossref-lookup.js', () => ({
  registerCrossRefLookupTool: vi.fn(),
}));

/* Mock job-runner — needed by wrapToolsWithNotification in server.ts */
vi.mock('../../src/aurora/job-runner.js', () => ({
  checkCompletedJobs: vi.fn().mockResolvedValue([]),
  markJobNotified: vi.fn(),
}));

import { SCOPES, type ServerScope } from '../../src/mcp/scopes.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { registerAuroraSearchTool } from '../../src/mcp/tools/aurora-search.js';
import { registerAuroraAskTool } from '../../src/mcp/tools/aurora-ask.js';
import { registerAuroraStatusTool } from '../../src/mcp/tools/aurora-status.js';
import { registerRunsTool } from '../../src/mcp/tools/runs.js';

/* ------------------------------------------------------------------ */
/*  SCOPES registry tests                                              */
/* ------------------------------------------------------------------ */

describe('SCOPES registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defines exactly 10 scopes', () => {
    expect(Object.keys(SCOPES)).toHaveLength(10);
  });

  it('has the expected scope names', () => {
    const expected = [
      'aurora-search',
      'aurora-insights',
      'aurora-memory',
      'aurora-ingest-text',
      'aurora-ingest-media',
      'aurora-media',
      'aurora-library',
      'aurora-quality',
      'neuron-runs',
      'neuron-analytics',
    ];
    expect(Object.keys(SCOPES).sort()).toEqual(expected.sort());
  });

  it('each scope has name, description, and registerTools', () => {
    for (const [key, scope] of Object.entries(SCOPES)) {
      expect(scope.name).toBe(key);
      expect(scope.description).toBeTruthy();
      expect(typeof scope.registerTools).toBe('function');
    }
  });

  it('aurora-search scope registers 3 tools', () => {
    const fakeServer = { prompt: vi.fn() } as unknown as Parameters<ServerScope['registerTools']>[0];
    SCOPES['aurora-search'].registerTools(fakeServer);

    expect(registerAuroraSearchTool).toHaveBeenCalledOnce();
    expect(registerAuroraSearchTool).toHaveBeenCalledWith(fakeServer);
    expect(registerAuroraAskTool).toHaveBeenCalledOnce();
    expect(registerAuroraAskTool).toHaveBeenCalledWith(fakeServer);
    expect(registerAuroraStatusTool).toHaveBeenCalledOnce();
    expect(registerAuroraStatusTool).toHaveBeenCalledWith(fakeServer);
  });

  it('neuron-runs scope registers runs tool', () => {
    const fakeServer = { prompt: vi.fn() } as unknown as Parameters<ServerScope['registerTools']>[0];
    SCOPES['neuron-runs'].registerTools(fakeServer);

    expect(registerRunsTool).toHaveBeenCalledOnce();
    expect(registerRunsTool).toHaveBeenCalledWith(fakeServer);
  });

  it('all scopes register tools without errors', () => {
    const fakeServer = { prompt: vi.fn() } as unknown as Parameters<ServerScope['registerTools']>[0];
    expect(() => {
      for (const scope of Object.values(SCOPES)) {
        scope.registerTools(fakeServer);
      }
    }).not.toThrow();
  });

  it('scope names match their key in the record', () => {
    for (const [key, scope] of Object.entries(SCOPES)) {
      expect(scope.name).toBe(key);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  createMcpServer tests                                              */
/* ------------------------------------------------------------------ */

describe('createMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for invalid scope', () => {
    expect(() => createMcpServer('nonexistent')).toThrow(/Unknown scope/);
  });

  it('creates server with valid scope', () => {
    const server = createMcpServer('aurora-search');
    expect(server).toBeDefined();
  });

  it('creates server with all scope', () => {
    const server = createMcpServer('all');
    expect(server).toBeDefined();
  });

  it('creates server with no scope (backwards compatible)', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});
