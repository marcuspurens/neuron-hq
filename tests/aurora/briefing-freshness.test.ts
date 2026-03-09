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
vi.mock('../../src/aurora/cross-ref.js', () => ({
  unifiedSearch: (...args: unknown[]) => mockUnifiedSearch(...args),
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
    maxTokens: 8192,
  }),
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxTokens: 8192,
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
    mockCreate.mockReset();
    mockQuery.mockReset();
  });

  it('includes freshnessScore and freshnessStatus in facts', async () => {
    setupBaseMocks();
    // DB returns last_verified = null for the node
    mockQuery.mockResolvedValue({ rows: [{ last_verified: null }] });

    const result = await briefing('TypeScript');

    expect(result.facts[0]).toHaveProperty('freshnessScore');
    expect(result.facts[0]).toHaveProperty('freshnessStatus');
  });

  it('marks unverified sources with score 0 and status unverified', async () => {
    setupBaseMocks();
    mockQuery.mockResolvedValue({ rows: [{ last_verified: null }] });

    const result = await briefing('TypeScript');

    expect(result.facts[0].freshnessScore).toBe(0);
    expect(result.facts[0].freshnessStatus).toBe('unverified');
  });

  it('marks recently verified sources as fresh', async () => {
    setupBaseMocks();
    mockQuery.mockResolvedValue({
      rows: [{ last_verified: new Date().toISOString() }],
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
    mockQuery.mockResolvedValue({ rows: [{ last_verified: null }] });

    const result = await briefing('TypeScript');

    expect(result.facts[0]).not.toHaveProperty('nodeId');
  });
});
