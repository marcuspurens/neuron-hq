import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeManagerAgent, type KMReport } from '../../src/core/agents/knowledge-manager.js';

// Mock all Aurora dependencies
vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: vi.fn(),
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

// Import mocked modules
import { getGaps } from '../../src/aurora/knowledge-gaps.js';
import { getFreshnessReport, verifySource } from '../../src/aurora/freshness.js';
import { suggestResearch } from '../../src/aurora/gap-brief.js';
import { remember } from '../../src/aurora/memory.js';

const mockGetGaps = vi.mocked(getGaps);
const mockGetFreshnessReport = vi.mocked(getFreshnessReport);
const mockVerifySource = vi.mocked(verifySource);
const mockSuggestResearch = vi.mocked(suggestResearch);
const mockRemember = vi.mocked(remember);

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
      { question: 'What is quantum computing?', askedAt: '2026-01-01T00:00:00Z', frequency: 3 },
      { question: 'How does RAG work?', askedAt: '2026-01-02T00:00:00Z', frequency: 1 },
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
    primaryGap: { question: 'What is quantum computing?', askedAt: '2026-01-01T00:00:00Z', frequency: 3 },
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
    });

    it('researches gaps and refreshes stale sources', async () => {
      const agent = new KnowledgeManagerAgent(audit, { maxActions: 10 });
      const report = await agent.run();

      expect(report.gapsFound).toBe(2);
      expect(report.gapsResearched).toBe(2);
      expect(report.sourcesRefreshed).toBe(1);
      expect(report.newNodesCreated).toBe(2);
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
          primaryGap: { question: 'How does RAG work?', askedAt: '2026-01-02T00:00:00Z', frequency: 1 },
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
          { question: 'High freq question', askedAt: '2026-01-01T00:00:00Z', frequency: 10 },
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
});
