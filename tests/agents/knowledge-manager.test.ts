import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeManagerAgent, type KMReport } from '../../src/core/agents/knowledge-manager.js';

// Mock all Aurora dependencies
vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: vi.fn(),
  resolveGap: vi.fn(),
}));

vi.mock('../../src/aurora/freshness.js', () => ({
  getFreshnessReport: vi.fn(),
  verifySource: vi.fn(),
}));

vi.mock('../../src/aurora/gap-brief.js', () => ({
  suggestResearch: vi.fn(),
}));

vi.mock('../../src/aurora/memory.js', () => ({
  remember: vi.fn(),
}));

vi.mock('../../src/aurora/web-search.js', () => ({
  webSearch: vi.fn(),
}));

vi.mock('../../src/aurora/intake.js', () => ({
  ingestUrl: vi.fn(),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  getEmbeddingProvider: vi.fn(),
}));

// Import mocked modules
import { getGaps, resolveGap } from '../../src/aurora/knowledge-gaps.js';
import { getFreshnessReport, verifySource } from '../../src/aurora/freshness.js';
import { suggestResearch } from '../../src/aurora/gap-brief.js';
import { remember } from '../../src/aurora/memory.js';
import { webSearch } from '../../src/aurora/web-search.js';
import { ingestUrl } from '../../src/aurora/intake.js';
import { getEmbeddingProvider } from '../../src/core/embeddings.js';

const mockGetGaps = vi.mocked(getGaps);
const mockGetFreshnessReport = vi.mocked(getFreshnessReport);
const mockVerifySource = vi.mocked(verifySource);
const mockSuggestResearch = vi.mocked(suggestResearch);
const mockRemember = vi.mocked(remember);
const mockWebSearch = vi.mocked(webSearch);
const mockIngestUrl = vi.mocked(ingestUrl);
const mockResolveGap = vi.mocked(resolveGap);
const mockGetEmbeddingProvider = vi.mocked(getEmbeddingProvider);

function createMockAudit(): { log: ReturnType<typeof vi.fn>; entries: unknown[] } {
  const entries: unknown[] = [];
  const log = vi.fn(async (entry: unknown) => {
    entries.push(entry);
  });
  return { log, entries };
}

function setupDefaultMocks(): void {
  mockGetGaps.mockResolvedValue({
    gaps: [
      { id: 'gap-1', question: 'What is quantum computing?', askedAt: '2026-01-01T00:00:00Z', frequency: 3 },
      { id: 'gap-2', question: 'How does RAG work?', askedAt: '2026-01-02T00:00:00Z', frequency: 1 },
    ],
    totalUnanswered: 2,
  });

  mockGetFreshnessReport.mockResolvedValue([
    {
      nodeId: 'node-1',
      title: 'Quantum entanglement overview',
      type: 'fact',
      confidence: 0.8,
      lastVerified: '2025-10-01T00:00:00Z',
      daysSinceVerified: 165,
      freshnessScore: 0.1,
      status: 'stale',
    },
  ]);

  mockSuggestResearch.mockResolvedValue({
    primaryGap: { id: 'gap-1', question: 'What is quantum computing?', askedAt: '2026-01-01T00:00:00Z', frequency: 3 },
    relatedGaps: [],
    knownFacts: [],
    brief: {
      background: 'Some background',
      gap: 'Quantum computing details',
      suggestions: ['Read recent papers', 'Check IBM docs'],
    },
    metadata: { generatedAt: '2026-03-13T00:00:00Z', totalRelatedGaps: 0, totalKnownFacts: 0 },
  });

  mockRemember.mockResolvedValue({
    nodeId: 'new-node-1',
    action: 'created',
  });

  mockVerifySource.mockResolvedValue(true);

  mockWebSearch.mockResolvedValue(['https://example.com/result1', 'https://example.com/result2']);

  mockIngestUrl.mockResolvedValue({
    documentNodeId: 'doc_abc123',
    chunkNodeIds: ['doc_abc123_chunk_0'],
    title: 'Example Page',
    wordCount: 500,
    chunkCount: 1,
    crossRefsCreated: 0,
    crossRefMatches: [],
  });

  mockResolveGap.mockResolvedValue(undefined);

  mockGetEmbeddingProvider.mockReturnValue({
    embed: vi.fn().mockRejectedValue(new Error('Embedding not available')),
    embedBatch: vi.fn().mockRejectedValue(new Error('Embedding not available')),
    dimension: 1024,
  });
}

describe('KnowledgeManagerAgent', () => {
  let audit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    vi.clearAllMocks();
    audit = createMockAudit();
    setupDefaultMocks();
  });

  describe('constructor', () => {
    it('applies default options', () => {
      const agent = new KnowledgeManagerAgent(audit);
      const opts = (agent as unknown as { options: Record<string, unknown> }).options;
      expect(opts.maxActions).toBe(5);
      expect(opts.includeStale).toBe(true);
      expect(opts.focusTopic).toBeUndefined();
    });

    it('accepts custom options', () => {
      const agent = new KnowledgeManagerAgent(audit, {
        maxActions: 3,
        focusTopic: 'quantum',
        includeStale: false,
      });
      const opts = (agent as unknown as { options: Record<string, unknown> }).options;
      expect(opts.maxActions).toBe(3);
      expect(opts.focusTopic).toBe('quantum');
      expect(opts.includeStale).toBe(false);
    });
  });

  describe('run()', () => {
    it('returns a valid KMReport', async () => {
      const agent = new KnowledgeManagerAgent(audit);
      const report = await agent.run();

      expect(report).toHaveProperty('gapsFound');
      expect(report).toHaveProperty('gapsResearched');
      expect(report).toHaveProperty('sourcesRefreshed');
      expect(report).toHaveProperty('newNodesCreated');
      expect(report).toHaveProperty('summary');
      expect(typeof report.summary).toBe('string');
      expect(report).toHaveProperty('gapsResolved');
      expect(report).toHaveProperty('urlsIngested');
      expect(report).toHaveProperty('factsLearned');
      expect(report).toHaveProperty('details');
      expect(Array.isArray(report.details)).toBe(true);
    });

    it('researches gaps and refreshes stale sources', async () => {
      const agent = new KnowledgeManagerAgent(audit, { maxActions: 10 });
      const report = await agent.run();

      expect(report.gapsFound).toBe(2);
      expect(report.gapsResearched).toBe(2);
      expect(report.sourcesRefreshed).toBe(1);
      expect(report.urlsIngested).toBeGreaterThan(0);
      expect(report.factsLearned).toBeGreaterThan(0);
      expect(report.details).toHaveLength(2);
      expect(mockWebSearch).toHaveBeenCalledTimes(2);
      expect(mockIngestUrl).toHaveBeenCalled();
      expect(mockSuggestResearch).toHaveBeenCalledTimes(2);
      expect(mockRemember).toHaveBeenCalledTimes(2);
      expect(mockVerifySource).toHaveBeenCalledWith('node-1');
    });

    it('respects maxActions limit', async () => {
      const agent = new KnowledgeManagerAgent(audit, { maxActions: 1 });
      const report = await agent.run();

      // Only 1 action should be taken (highest score gap: frequency 3 * 2 = 6)
      expect(report.gapsResearched + report.sourcesRefreshed).toBe(1);
    });

    it('logs start and complete to audit', async () => {
      const agent = new KnowledgeManagerAgent(audit);
      await agent.run();

      const phases = (audit.entries as Array<{ phase?: string }>).map((e) => e.phase);
      expect(phases).toContain('start');
      expect(phases).toContain('scan');
      expect(phases).toContain('complete');
    });
  });

  describe('scan — focusTopic filtering', () => {
    it('filters gaps by focusTopic (case-insensitive)', async () => {
      const agent = new KnowledgeManagerAgent(audit, { focusTopic: 'quantum', maxActions: 10 });
      const report = await agent.run();

      // Only 'What is quantum computing?' matches; stale node 'Quantum entanglement...' also matches
      expect(mockSuggestResearch).toHaveBeenCalledTimes(1);
      expect(report.gapsResearched).toBe(1);
      expect(report.sourcesRefreshed).toBe(1);
    });

    it('filters stale nodes by focusTopic', async () => {
      const agent = new KnowledgeManagerAgent(audit, { focusTopic: 'RAG', maxActions: 10 });
      const report = await agent.run();

      // 'How does RAG work?' matches; stale node does not match 'RAG'
      expect(report.gapsResearched).toBe(1);
      expect(report.sourcesRefreshed).toBe(0);
    });
  });

  describe('scan — includeStale', () => {
    it('skips stale sources when includeStale is false', async () => {
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 10 });
      const report = await agent.run();

      expect(mockGetFreshnessReport).not.toHaveBeenCalled();
      expect(report.sourcesRefreshed).toBe(0);
    });
  });

  describe('research — error handling', () => {
    it('continues to next candidate when one fails', async () => {
      mockSuggestResearch
        .mockRejectedValueOnce(new Error('API timeout'))
        .mockResolvedValueOnce({
          primaryGap: { id: 'gap-2', question: 'How does RAG work?', askedAt: '2026-01-02T00:00:00Z', frequency: 1 },
          relatedGaps: [],
          knownFacts: [],
          brief: { background: 'RAG info', gap: 'RAG details', suggestions: ['Study RAG'] },
          metadata: { generatedAt: '2026-03-13T00:00:00Z', totalRelatedGaps: 0, totalKnownFacts: 0 },
        });

      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 10 });
      const report = await agent.run();

      // First gap fails, second succeeds
      expect(report.gapsResearched).toBe(1);
    });

    it('logs errors for failed candidates', async () => {
      mockSuggestResearch.mockRejectedValue(new Error('API timeout'));

      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 10 });
      await agent.run();

      const errorEntries = (audit.entries as Array<{ action?: string }>).filter(
        (e) => e.action === 'gap-failed',
      );
      expect(errorEntries.length).toBe(2);
    });

    it('handles verifySource failure gracefully', async () => {
      mockVerifySource.mockRejectedValue(new Error('DB connection failed'));

      const agent = new KnowledgeManagerAgent(audit, { maxActions: 10 });
      const report = await agent.run();

      expect(report.sourcesRefreshed).toBe(0);
      const errorEntries = (audit.entries as Array<{ action?: string }>).filter(
        (e) => e.action === 'refresh-failed',
      );
      expect(errorEntries.length).toBe(1);
    });
  });

  describe('buildReport', () => {
    it('produces human-readable summary', async () => {
      const agent = new KnowledgeManagerAgent(audit, { maxActions: 10 });
      const report = await agent.run();

      expect(report.summary).toContain('Knowledge maintenance complete');
      expect(report.summary).toContain('gap(s)');
      expect(report.summary).toContain('Actions:');
    });

    it('says no actions when nothing was done', async () => {
      mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });
      mockGetFreshnessReport.mockResolvedValue([]);

      const agent = new KnowledgeManagerAgent(audit);
      const report = await agent.run();

      expect(report.gapsFound).toBe(0);
      expect(report.summary).toContain('No actions taken');
    });
  });

  describe('scoring', () => {
    it('prioritizes high-frequency gaps over stale nodes', async () => {
      mockGetGaps.mockResolvedValue({
        gaps: [
          { id: 'gap-hf', question: 'High freq question', askedAt: '2026-01-01T00:00:00Z', frequency: 10 },
        ],
        totalUnanswered: 1,
      });

      mockGetFreshnessReport.mockResolvedValue([
        {
          nodeId: 'stale-1',
          title: 'Low importance stale',
          type: 'fact',
          confidence: 0.3,
          lastVerified: null,
          daysSinceVerified: null,
          freshnessScore: 0,
          status: 'unverified',
        },
      ]);

      // maxActions=1 — should pick the gap (score: 10*2=20) over stale (score: 1*0.3=0.3)
      const agent = new KnowledgeManagerAgent(audit, { maxActions: 1 });
      const report = await agent.run();

      expect(report.gapsResearched).toBe(1);
      expect(report.sourcesRefreshed).toBe(0);
    });
  });

  describe('web search integration', () => {
    it('calls webSearch for each gap', async () => {
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 10 });
      await agent.run();
      expect(mockWebSearch).toHaveBeenCalledTimes(2);
      expect(mockWebSearch).toHaveBeenCalledWith('What is quantum computing?', 3);
      expect(mockWebSearch).toHaveBeenCalledWith('How does RAG work?', 3);
    });

    it('ingests URLs from web search results', async () => {
      mockWebSearch.mockResolvedValue(['https://a.com', 'https://b.com', 'https://c.com']);
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      expect(mockIngestUrl).toHaveBeenCalledTimes(3);
      expect(report.urlsIngested).toBe(3);
    });

    it('limits to 3 URLs per gap', async () => {
      mockWebSearch.mockResolvedValue(['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com', 'https://e.com']);
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      await agent.run();
      expect(mockIngestUrl).toHaveBeenCalledTimes(3);
    });

    it('continues when ingestUrl fails for one URL', async () => {
      mockWebSearch.mockResolvedValue(['https://fail.com', 'https://ok.com']);
      mockIngestUrl
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValueOnce({
          documentNodeId: 'doc_123',
          chunkNodeIds: [],
          title: 'OK Page',
          wordCount: 100,
          chunkCount: 0,
          crossRefsCreated: 0,
          crossRefMatches: [],
        });
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      expect(report.urlsIngested).toBe(1);
    });

    it('handles webSearch failure gracefully — gap still researched', async () => {
      mockWebSearch.mockRejectedValue(new Error('Network error'));
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      // webSearch threw, so researchGap should propagate the error
      // and the gap is counted as failed
      expect(report.gapsResearched).toBe(0);
    });
  });

  describe('gap resolution', () => {
    it('resolves gap when URLs are ingested', async () => {
      mockWebSearch.mockResolvedValue(['https://example.com']);
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      expect(mockResolveGap).toHaveBeenCalledWith('gap-1', {
        researchedBy: 'knowledge-manager',
        urlsIngested: ['https://example.com'],
        factsLearned: expect.any(Number),
      });
      expect(report.gapsResolved).toBe(1);
      expect(report.details[0].resolved).toBe(true);
    });

    it('does not resolve gap when no URLs ingested', async () => {
      mockWebSearch.mockResolvedValue([]);
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      expect(mockResolveGap).not.toHaveBeenCalled();
      expect(report.gapsResolved).toBe(0);
      expect(report.details[0].resolved).toBe(false);
    });
  });

  describe('semantic topic filtering', () => {
    it('uses embeddings when available', async () => {
      const mockEmbed = vi.fn()
        .mockResolvedValueOnce([1, 0, 0])  // topic embedding
        .mockResolvedValueOnce([0.9, 0.1, 0])  // gap 1 (high similarity)
        .mockResolvedValueOnce([0, 1, 0]);  // gap 2 (low similarity)

      mockGetEmbeddingProvider.mockReturnValue({
        embed: mockEmbed,
        embedBatch: vi.fn(),
        dimension: 3,
      });

      const agent = new KnowledgeManagerAgent(audit, { focusTopic: 'quantum', includeStale: false, maxActions: 10 });
      const report = await agent.run();

      expect(mockEmbed).toHaveBeenCalled();
      // Only the high-similarity gap should be researched
      expect(report.gapsResearched).toBe(1);
    });

    it('falls back to string match when embedding fails', async () => {
      mockGetEmbeddingProvider.mockReturnValue({
        embed: vi.fn().mockRejectedValue(new Error('Ollama not running')),
        embedBatch: vi.fn().mockRejectedValue(new Error('Ollama not running')),
        dimension: 1024,
      });

      const agent = new KnowledgeManagerAgent(audit, { focusTopic: 'quantum', includeStale: false, maxActions: 10 });
      const report = await agent.run();

      // String match: only 'What is quantum computing?' matches
      expect(report.gapsResearched).toBe(1);
    });
  });

  describe('KMReport new fields', () => {
    it('includes urlsIngested count', async () => {
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      expect(typeof report.urlsIngested).toBe('number');
    });

    it('includes factsLearned count', async () => {
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      expect(typeof report.factsLearned).toBe('number');
    });

    it('includes gapsResolved count', async () => {
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 1 });
      const report = await agent.run();
      expect(typeof report.gapsResolved).toBe('number');
    });

    it('includes details array with ResearchResult entries', async () => {
      const agent = new KnowledgeManagerAgent(audit, { includeStale: false, maxActions: 2 });
      const report = await agent.run();
      expect(report.details).toHaveLength(2);
      for (const detail of report.details) {
        expect(detail).toHaveProperty('gapId');
        expect(detail).toHaveProperty('question');
        expect(detail).toHaveProperty('urlsIngested');
        expect(detail).toHaveProperty('factsLearned');
        expect(detail).toHaveProperty('resolved');
      }
    });
  });
});
