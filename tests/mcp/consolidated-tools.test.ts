import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock underlying service modules ---

const mockLoadAuroraGraph = vi.fn();
const mockFindAuroraNodes = vi.fn();
vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
}));

const mockRenameSpeaker = vi.fn();
const mockMergeSpeakers = vi.fn();
const mockSuggestSpeakerMatches = vi.fn();
vi.mock('../../src/aurora/voiceprint.js', () => ({
  renameSpeaker: (...args: unknown[]) => mockRenameSpeaker(...args),
  mergeSpeakers: (...args: unknown[]) => mockMergeSpeakers(...args),
  suggestSpeakerMatches: (...args: unknown[]) => mockSuggestSpeakerMatches(...args),
}));

const mockListSpeakerIdentities = vi.fn();
const mockCreateSpeakerIdentity = vi.fn();
const mockConfirmSpeaker = vi.fn();
const mockRejectSpeakerSuggestion = vi.fn();
const mockAutoTagSpeakers = vi.fn();
vi.mock('../../src/aurora/speaker-identity.js', () => ({
  listSpeakerIdentities: (...args: unknown[]) => mockListSpeakerIdentities(...args),
  createSpeakerIdentity: (...args: unknown[]) => mockCreateSpeakerIdentity(...args),
  confirmSpeaker: (...args: unknown[]) => mockConfirmSpeaker(...args),
  rejectSpeakerSuggestion: (...args: unknown[]) => mockRejectSpeakerSuggestion(...args),
  autoTagSpeakers: (...args: unknown[]) => mockAutoTagSpeakers(...args),
}));

const mockGetJob = vi.fn();
const mockGetJobs = vi.fn();
const mockGetJobStats = vi.fn();
const mockCancelJob = vi.fn();
vi.mock('../../src/aurora/job-runner.js', () => ({
  getJob: (...args: unknown[]) => mockGetJob(...args),
  getJobs: (...args: unknown[]) => mockGetJobs(...args),
  getJobStats: (...args: unknown[]) => mockGetJobStats(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
}));

const mockRemember = vi.fn();
const mockRecall = vi.fn();
const mockMemoryStats = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  remember: (...args: unknown[]) => mockRemember(...args),
  recall: (...args: unknown[]) => mockRecall(...args),
  memoryStats: (...args: unknown[]) => mockMemoryStats(...args),
}));

const mockVerifySource = vi.fn();
const mockGetFreshnessReport = vi.fn();
vi.mock('../../src/aurora/freshness.js', () => ({
  verifySource: (...args: unknown[]) => mockVerifySource(...args),
  getFreshnessReport: (...args: unknown[]) => mockGetFreshnessReport(...args),
}));

const mockUnifiedSearch = vi.fn();
const mockCheckCrossRefIntegrity = vi.fn();
vi.mock('../../src/aurora/cross-ref.js', () => ({
  unifiedSearch: (...args: unknown[]) => mockUnifiedSearch(...args),
  checkCrossRefIntegrity: (...args: unknown[]) => mockCheckCrossRefIntegrity(...args),
}));

// Mock DB/embeddings to prevent real connections
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

// --- Import register functions ---
import { registerAuroraSpeakersTool } from '../../src/mcp/tools/aurora-speakers.js';
import { registerAuroraJobsConsolidatedTool } from '../../src/mcp/tools/aurora-jobs-consolidated.js';
import { registerAuroraMemoryConsolidatedTool } from '../../src/mcp/tools/aurora-memory.js';
import { registerAuroraFreshnessConsolidatedTool } from '../../src/mcp/tools/aurora-freshness-consolidated.js';
import { registerAuroraCrossRefConsolidatedTool } from '../../src/mcp/tools/aurora-cross-ref.js';

// --- Shared mock server setup ---
type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

function createMockServer(): {
  server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
  handlers: Record<string, ToolHandler>;
} {
  const handlers: Record<string, ToolHandler> = {};
  const server = {
    tool: vi.fn(
      (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
        handlers[name] = handler;
      },
    ),
  } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
  return { server, handlers };
}

// ============================================================
// 1. aurora_speakers — 3 tests: gallery, rename, auto_tag
// ============================================================
describe('Consolidated aurora_speakers tool', () => {
  let handlers: Record<string, ToolHandler>;
  let server: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    server = mock.server;
    handlers = mock.handlers;
    registerAuroraSpeakersTool(server);
  });

  it('registers the aurora_speakers tool', () => {
    expect(handlers).toHaveProperty('aurora_speakers');
    expect(server.tool).toHaveBeenCalledTimes(1);
  });

  it('gallery action calls loadAuroraGraph and findAuroraNodes', async () => {
    const fakeGraph = { nodes: [], edges: [], lastUpdated: '2026-01-01' };
    mockLoadAuroraGraph.mockResolvedValue(fakeGraph);
    mockFindAuroraNodes.mockReturnValue([]);

    const result = await handlers['aurora_speakers']({ action: 'gallery' });

    expect(mockLoadAuroraGraph).toHaveBeenCalled();
    expect(mockFindAuroraNodes).toHaveBeenCalledWith(fakeGraph, { type: 'voice_print' });
    expect(result.isError).not.toBe(true);
    // When no voice prints found, handler returns a plain text hint (not JSON)
    expect(result.content[0].text).toContain('No voice prints found');
  });

  it('rename action calls renameSpeaker with correct args', async () => {
    mockRenameSpeaker.mockResolvedValue({ oldName: 'SPEAKER_1', newName: 'Alice' });

    const result = await handlers['aurora_speakers']({
      action: 'rename',
      voicePrintId: 'vp-123',
      newName: 'Alice',
    });

    expect(mockRenameSpeaker).toHaveBeenCalledWith('vp-123', 'Alice');
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.newName).toBe('Alice');
  });

  it('auto_tag action calls autoTagSpeakers', async () => {
    mockAutoTagSpeakers.mockResolvedValue([{ voicePrintId: 'vp-1', identityName: 'Bob' }]);

    const result = await handlers['aurora_speakers']({
      action: 'auto_tag',
      voicePrintIds: ['vp-1', 'vp-2'],
    });

    expect(mockAutoTagSpeakers).toHaveBeenCalledWith(['vp-1', 'vp-2']);
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].identityName).toBe('Bob');
  });
});

// ============================================================
// 2. aurora_jobs — 2 tests: status, list
// ============================================================
describe('Consolidated aurora_jobs tool', () => {
  let handlers: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    handlers = mock.handlers;
    registerAuroraJobsConsolidatedTool(mock.server);
  });

  it('status action calls getJob', async () => {
    mockGetJob.mockResolvedValue({ id: 'job-1', status: 'done', progress: 100 });

    const result = await handlers['aurora_jobs']({
      action: 'status',
      job_id: 'job-1',
    });

    expect(mockGetJob).toHaveBeenCalledWith('job-1');
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('job-1');
    expect(data.status).toBe('done');
  });

  it('list action calls getJobs', async () => {
    mockGetJobs.mockResolvedValue([
      { id: 'j1', status: 'done' },
      { id: 'j2', status: 'running' },
    ]);

    const result = await handlers['aurora_jobs']({
      action: 'list',
      status: 'done',
    });

    expect(mockGetJobs).toHaveBeenCalledWith({ status: 'done', limit: undefined });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(2);
  });
});

// ============================================================
// 3. aurora_memory — 2 tests: remember, recall
// ============================================================
describe('Consolidated aurora_memory tool', () => {
  let handlers: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    handlers = mock.handlers;
    registerAuroraMemoryConsolidatedTool(mock.server);
  });

  it('remember action calls remember function', async () => {
    mockRemember.mockResolvedValue({ id: 'mem-1', stored: true });

    const result = await handlers['aurora_memory']({
      action: 'remember',
      text: 'TypeScript is great',
      type: 'fact',
    });

    expect(mockRemember).toHaveBeenCalledWith('TypeScript is great', {
      type: 'fact',
      scope: 'personal',
      tags: undefined,
      source: undefined,
    });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.id).toBe('mem-1');
    expect(data.stored).toBe(true);
  });

  it('recall action calls recall function', async () => {
    mockRecall.mockResolvedValue({ memories: [{ text: 'TS is typed JS' }] });

    const result = await handlers['aurora_memory']({
      action: 'recall',
      query: 'TypeScript',
    });

    expect(mockRecall).toHaveBeenCalledWith('TypeScript', {
      type: undefined,
      scope: undefined,
      limit: undefined,
    });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.memories).toHaveLength(1);
  });
});

// ============================================================
// 4. aurora_freshness — 1 test: verify
// ============================================================
describe('Consolidated aurora_freshness tool', () => {
  let handlers: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    handlers = mock.handlers;
    registerAuroraFreshnessConsolidatedTool(mock.server);
  });

  it('verify action calls verifySource', async () => {
    mockVerifySource.mockResolvedValue(true);

    const result = await handlers['aurora_freshness']({
      action: 'verify',
      node_id: 'node-42',
    });

    expect(mockVerifySource).toHaveBeenCalledWith('node-42');
    expect(result.isError).not.toBe(true);
    // Handler returns plain text, not JSON
    expect(result.content[0].text).toContain('node-42');
    expect(result.content[0].text).toContain('verified');
  });
});

// ============================================================
// 5. aurora_cross_ref — 1 test: search
// ============================================================
describe('Consolidated aurora_cross_ref tool', () => {
  let handlers: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = createMockServer();
    handlers = mock.handlers;
    registerAuroraCrossRefConsolidatedTool(mock.server);
  });

  it('search action calls unifiedSearch', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });

    const result = await handlers['aurora_cross_ref']({
      action: 'search',
      query: 'voice recognition',
    });

    expect(mockUnifiedSearch).toHaveBeenCalledWith('voice recognition', {
      limit: undefined,
      minSimilarity: undefined,
      type: undefined,
    });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    // Handler transforms result into { neuron, aurora, totalCrossRefs }
    expect(data).toHaveProperty('neuron');
    expect(data).toHaveProperty('aurora');
    expect(data).toHaveProperty('totalCrossRefs');
  });
});
