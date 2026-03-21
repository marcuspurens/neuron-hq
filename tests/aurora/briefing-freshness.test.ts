import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks — same as briefing.test.ts                                   */
/* ------------------------------------------------------------------ */

const mockRecall = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  recall: (...args: unknown[]) => mockRecall(...args),
}));

const mockSearchAurora = vi.fn();
vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
}));

const mockGetGaps = vi.fn();
vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: (...args: unknown[]) => mockGetGaps(...args),
}));

const mockUnifiedSearch = vi.fn();
const mockCheckCrossRefIntegrity = vi.fn();
vi.mock('../../src/aurora/cross-ref.js', () => ({
  unifiedSearch: (...args: unknown[]) => mockUnifiedSearch(...args),
  checkCrossRefIntegrity: (...args: unknown[]) => mockCheckCrossRefIntegrity(...args),
}));

const mockCreate = vi.fn();
vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: () => ({
    client: { messages: { create: mockCreate } },
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 512,
  }),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: () => ({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 16384,
  }),
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxTokens: 16384,
  },
}));

// Mock DB for freshness queries
const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { briefing } from '../../src/aurora/briefing.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function setupBaseMocks(): void {
  mockRecall.mockResolvedValue({
    memories: [
      {
        id: 'mem-1',
        title: 'TypeScript strict mode',
        type: 'fact',
        text: 'TS strict prevents errors',
        confidence: 0.8,
        scope: 'personal',
        tags: [],
        similarity: 0.92,
        related: [],
        createdAt: '2026-03-09T10:00:00Z',
        updatedAt: '2026-03-09T10:00:00Z',
      },
    ],
    totalFound: 1,
  });
  mockSearchAurora.mockResolvedValue([
    {
      id: 's1',
      title: 'TS Best Practices',
      type: 'document',
      similarity: 0.85,
      confidence: 0.9,
      scope: 'shared',
      source: 'semantic',
    },
  ]);
  mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });
  mockUnifiedSearch.mockResolvedValue({
    neuronResults: [],
    auroraResults: [],
    crossRefs: [],
  });
  mockCheckCrossRefIntegrity.mockResolvedValue([]);
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Summary about TypeScript' }],
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('briefing() freshness enrichment', () => {
  beforeEach(() => {
    mockRecall.mockReset();
    mockSearchAurora.mockReset();
    mockGetGaps.mockReset();
    mockUnifiedSearch.mockReset();
    mockCheckCrossRefIntegrity.mockReset();
    mockCreate.mockReset();
    mockQuery.mockReset();
  });

  it('includes freshnessScore and freshnessStatus in facts', async () => {
    setupBaseMocks();
    // DB returns batch result with id + last_verified
    mockQuery.mockResolvedValue({ rows: [{ id: 'mem-1', last_verified: null }] });

    const result = await briefing('TypeScript');

    expect(result.facts[0]).toHaveProperty('freshnessScore');
    expect(result.facts[0]).toHaveProperty('freshnessStatus');
  });

  it('marks unverified sources with score 0 and status unverified', async () => {
    setupBaseMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 'mem-1', last_verified: null }] });

    const result = await briefing('TypeScript');

    expect(result.facts[0].freshnessScore).toBe(0);
    expect(result.facts[0].freshnessStatus).toBe('unverified');
  });

  it('marks recently verified sources as fresh', async () => {
    setupBaseMocks();
    mockQuery.mockResolvedValue({
      rows: [{ id: 'mem-1', last_verified: new Date().toISOString() }],
    });

    const result = await briefing('TypeScript');

    expect(result.facts[0].freshnessScore).toBe(1);
    expect(result.facts[0].freshnessStatus).toBe('fresh');
  });

  it('falls back to unverified when DB query fails', async () => {
    setupBaseMocks();
    mockQuery.mockRejectedValue(new Error('DB connection failed'));

    const result = await briefing('TypeScript');

    expect(result.facts[0].freshnessScore).toBe(0);
    expect(result.facts[0].freshnessStatus).toBe('unverified');
  });

  it('does not expose nodeId in returned facts', async () => {
    setupBaseMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 'mem-1', last_verified: null }] });

    const result = await briefing('TypeScript');

    expect(result.facts[0]).not.toHaveProperty('nodeId');
  });

  it('makes exactly 1 DB query for freshness regardless of fact count', async () => {
    mockRecall.mockResolvedValue({
      memories: [
        { id: 'mem-1', title: 'Fact 1', type: 'fact', confidence: 0.8, similarity: 0.9, tags: [], related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'mem-2', title: 'Fact 2', type: 'fact', confidence: 0.7, similarity: 0.8, tags: [], related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'mem-3', title: 'Fact 3', type: 'fact', confidence: 0.6, similarity: 0.7, tags: [], related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      totalFound: 3,
    });
    mockSearchAurora.mockResolvedValue([]);
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });
    mockCheckCrossRefIntegrity.mockResolvedValue([]);
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Summary' }],
    });
    mockQuery.mockResolvedValue({
      rows: [
        { id: 'mem-1', last_verified: new Date().toISOString() },
        { id: 'mem-2', last_verified: null },
        { id: 'mem-3', last_verified: new Date(Date.now() - 60 * 86400000).toISOString() },
      ],
    });

    await briefing('test');

    // Should be exactly 1 query for freshness (batch), not 3
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('ANY'),
      [['mem-1', 'mem-2', 'mem-3']],
    );
  });

  it('handles batch with mixed results (some nodes found, some not)', async () => {
    mockRecall.mockResolvedValue({
      memories: [
        { id: 'mem-1', title: 'Fact 1', type: 'fact', confidence: 0.8, similarity: 0.9, tags: [], related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'mem-2', title: 'Fact 2', type: 'fact', confidence: 0.7, similarity: 0.8, tags: [], related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'mem-3', title: 'Fact 3', type: 'fact', confidence: 0.6, similarity: 0.7, tags: [], related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      totalFound: 3,
    });
    mockSearchAurora.mockResolvedValue([]);
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });
    mockCheckCrossRefIntegrity.mockResolvedValue([]);
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Summary' }],
    });
    // DB only returns 1 of 3 nodes — mem-2 and mem-3 are missing from DB
    mockQuery.mockResolvedValue({
      rows: [
        { id: 'mem-1', last_verified: new Date().toISOString() },
      ],
    });

    const result = await briefing('test');

    // mem-1 was found with recent verification → fresh
    expect(result.facts[0].freshnessScore).toBe(1);
    expect(result.facts[0].freshnessStatus).toBe('fresh');
    // mem-2 not in DB → unverified defaults
    expect(result.facts[1].freshnessScore).toBe(0);
    expect(result.facts[1].freshnessStatus).toBe('unverified');
    // mem-3 not in DB → unverified defaults
    expect(result.facts[2].freshnessScore).toBe(0);
    expect(result.facts[2].freshnessStatus).toBe('unverified');
  });
});
