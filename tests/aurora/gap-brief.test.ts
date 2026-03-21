import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

// Mock knowledge-gaps
const mockGetGaps = vi.fn();
vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: (...args: unknown[]) => mockGetGaps(...args),
}));

// Mock memory (recall)
const mockRecall = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  recall: (...args: unknown[]) => mockRecall(...args),
}));

// Mock search
const mockSearchAurora = vi.fn();
vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
}));

// Mock agent-client (Claude calls)
const mockCreate = vi.fn();
const mockCreateAgentClient = vi.fn(() => ({
  client: { messages: { create: mockCreate } },
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 512,
}));
vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: (...args: unknown[]) => mockCreateAgentClient(...args),
}));

// Mock model-registry
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

// Mock db (for freshness)
const mockPoolQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: (...args: unknown[]) => mockPoolQuery(...args) }),
}));

// Mock freshness
vi.mock('../../src/aurora/freshness.js', () => ({
  calculateFreshnessScore: (lastVerified: Date | null) => lastVerified ? 0.8 : 0,
  freshnessStatus: (score: number, lastVerified: Date | null) =>
    !lastVerified ? 'unverified' : score >= 0.7 ? 'fresh' : score >= 0.3 ? 'aging' : 'stale',
}));

// Import AFTER mocks
import { suggestResearch, suggestResearchBatch } from '../../src/aurora/gap-brief.js';

/* ------------------------------------------------------------------ */
/*  Helpers: Mock data factories                                       */
/* ------------------------------------------------------------------ */

function defaultGapsResult() {
  return {
    gaps: [
      { question: 'How does pyannote diarization work?', askedAt: '2026-03-09T09:00:00Z', frequency: 5 },
      { question: 'What voices can pyannote identify?', askedAt: '2026-03-09T08:00:00Z', frequency: 3 },
      { question: 'How to train pyannote on new voices?', askedAt: '2026-03-09T07:00:00Z', frequency: 1 },
      { question: 'How much do Hetzner ARM servers cost?', askedAt: '2026-03-08T10:00:00Z', frequency: 3 },
      { question: 'How to export Claude Desktop conversations?', askedAt: '2026-03-07T10:00:00Z', frequency: 2 },
    ],
    totalUnanswered: 5,
  };
}

function defaultRecallResult() {
  return {
    memories: [
      {
        id: 'mem-1',
        title: 'pyannote.audio for voice identification',
        type: 'fact',
        text: 'pyannote.audio is used for speaker identification',
        confidence: 0.8,
        scope: 'personal',
        tags: [],
        similarity: 0.9,
        related: [],
        createdAt: '2026-03-09T10:00:00Z',
        updatedAt: '2026-03-09T10:00:00Z',
      },
    ],
    totalFound: 1,
  };
}

function defaultSearchResults() {
  return [
    {
      id: 'sr-1',
      title: 'What voices can pyannote identify?',
      type: 'research',
      similarity: 0.75,
      confidence: 0.5,
      scope: 'personal',
      source: 'semantic' as const,
    },
  ];
}

function defaultClaudeResponse() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        background: 'pyannote.audio is used for voice identification in YouTube transcripts.',
        gap: 'Documentation about pyannote diarization of multiple speakers is missing.',
        suggestions: [
          'Read pyannote.audio documentation',
          'Test with multi-speaker video',
          'Check pyannote GitHub issues',
        ],
      }),
    }],
  };
}

function setupDefaultMocks() {
  mockGetGaps.mockResolvedValue(defaultGapsResult());
  mockRecall.mockResolvedValue(defaultRecallResult());
  mockSearchAurora.mockResolvedValue(defaultSearchResults());
  mockCreate.mockResolvedValue(defaultClaudeResponse());
  mockPoolQuery.mockResolvedValue({ rows: [{ last_verified: '2026-03-09T10:00:00Z' }] });
}

/* ------------------------------------------------------------------ */
/*  suggestResearch() tests                                            */
/* ------------------------------------------------------------------ */

describe('suggestResearch()', () => {
  beforeEach(() => {
    mockGetGaps.mockReset();
    mockRecall.mockReset();
    mockSearchAurora.mockReset();
    mockCreate.mockReset();
    mockCreateAgentClient.mockClear();
    mockPoolQuery.mockReset();
  });

  it('returns ResearchSuggestion with correct structure', async () => {
    setupDefaultMocks();
    const result = await suggestResearch('How does pyannote diarization work?');

    // primaryGap
    expect(result.primaryGap).toBeDefined();
    expect(typeof result.primaryGap.question).toBe('string');
    expect(typeof result.primaryGap.askedAt).toBe('string');
    expect(typeof result.primaryGap.frequency).toBe('number');

    // relatedGaps
    expect(Array.isArray(result.relatedGaps)).toBe(true);

    // knownFacts
    expect(Array.isArray(result.knownFacts)).toBe(true);
    for (const fact of result.knownFacts) {
      expect(typeof fact.title).toBe('string');
      expect(typeof fact.confidence).toBe('number');
      expect(typeof fact.freshnessStatus).toBe('string');
    }

    // brief
    expect(typeof result.brief.background).toBe('string');
    expect(typeof result.brief.gap).toBe('string');
    expect(Array.isArray(result.brief.suggestions)).toBe(true);

    // metadata
    expect(typeof result.metadata.generatedAt).toBe('string');
    expect(typeof result.metadata.totalRelatedGaps).toBe('number');
    expect(typeof result.metadata.totalKnownFacts).toBe('number');
  });

  it('finds related gaps via embedding similarity', async () => {
    setupDefaultMocks();
    const result = await suggestResearch('How does pyannote diarization work?');

    // searchAurora should be called with research type
    expect(mockSearchAurora).toHaveBeenCalledWith(
      'How does pyannote diarization work?',
      expect.objectContaining({ type: 'research' }),
    );

    // relatedGaps populated from search results matching gap questions
    expect(result.relatedGaps.length).toBeGreaterThanOrEqual(1);
    const relatedQuestions = result.relatedGaps.map((g) => g.question);
    expect(relatedQuestions).toContain('What voices can pyannote identify?');
  });

  it('gathers known facts via recall()', async () => {
    setupDefaultMocks();
    const result = await suggestResearch('How does pyannote diarization work?');

    // recall called with question
    expect(mockRecall).toHaveBeenCalledWith(
      'How does pyannote diarization work?',
      expect.objectContaining({ limit: 10 }),
    );

    // knownFacts populated with title/confidence/freshnessStatus
    expect(result.knownFacts).toHaveLength(1);
    expect(result.knownFacts[0].title).toBe('pyannote.audio for voice identification');
    expect(result.knownFacts[0].confidence).toBe(0.8);
    expect(typeof result.knownFacts[0].freshnessStatus).toBe('string');
  });

  it('generates brief with background/gap/suggestions sections', async () => {
    setupDefaultMocks();
    const result = await suggestResearch('How does pyannote diarization work?');

    // mockCreate called
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // brief has 3 non-empty sections
    expect(result.brief.background.length).toBeGreaterThan(0);
    expect(result.brief.gap.length).toBeGreaterThan(0);
    expect(result.brief.suggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('handles question without matching gap (creates temporary)', async () => {
    setupDefaultMocks();
    const result = await suggestResearch('Something completely unrelated');

    expect(result.primaryGap.question).toBe('Something completely unrelated');
    expect(result.primaryGap.frequency).toBe(0);
    expect(result.primaryGap.askedAt).toBeDefined();
  });

  it('works without embeddings (keyword fallback)', async () => {
    setupDefaultMocks();
    mockSearchAurora.mockRejectedValue(new Error('Embeddings not available'));

    // Use low minGapSimilarity so keyword fallback can match on shared 'pyannote' word.
    // keywordSimilarity: 'pyannote' is 1 of 4 significant words = 0.25
    const result = await suggestResearch(
      'How does pyannote diarization work?',
      { minGapSimilarity: 0.2 },
    );

    expect(result).toBeDefined();
    expect(result.primaryGap.question).toBe('How does pyannote diarization work?');

    // Keyword fallback: other pyannote gaps share the word 'pyannote'
    const relatedQuestions = result.relatedGaps.map((g) => g.question);
    const pyannoteRelated = relatedQuestions.filter((q) =>
      q.toLowerCase().includes('pyannote'),
    );
    expect(pyannoteRelated.length).toBeGreaterThanOrEqual(1);
  });

  it('enriches facts with freshness info', async () => {
    setupDefaultMocks();
    // mockPoolQuery returns last_verified → freshness mock calculates 0.8 → 'fresh'
    const result = await suggestResearch('How does pyannote diarization work?');

    expect(result.knownFacts).toHaveLength(1);
    expect(result.knownFacts[0].freshnessStatus).toBe('fresh');
  });

  it('handles Claude JSON parse failure gracefully', async () => {
    setupDefaultMocks();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'some non-JSON text' }],
    });

    const result = await suggestResearch('How does pyannote diarization work?');

    // brief should still have a valid structure
    expect(typeof result.brief.background).toBe('string');
    expect(typeof result.brief.gap).toBe('string');
    expect(Array.isArray(result.brief.suggestions)).toBe(true);
    expect(result.brief.suggestions.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  suggestResearchBatch() tests                                       */
/* ------------------------------------------------------------------ */

describe('suggestResearchBatch()', () => {
  beforeEach(() => {
    mockGetGaps.mockReset();
    mockRecall.mockReset();
    mockSearchAurora.mockReset();
    mockCreate.mockReset();
    mockCreateAgentClient.mockClear();
    mockPoolQuery.mockReset();
  });

  it('returns max topN suggestions', async () => {
    setupDefaultMocks();
    const results = await suggestResearchBatch({ topN: 2 });

    expect(results.length).toBeLessThanOrEqual(2);
    expect(results.length).toBeGreaterThan(0);
  });

  it('groups related gaps (avoids duplicates)', async () => {
    setupDefaultMocks();
    // gap1 = 'How does pyannote diarization work?' (frequency 5, processed first)
    // searchAurora returns result matching 'What voices can pyannote identify?' (gap2)
    // So gap2 should be marked as covered and NOT appear as a top-level suggestion

    const results = await suggestResearchBatch({ topN: 5 });

    // Gather all primary gap questions
    const primaryQuestions = results.map((r) => r.primaryGap.question);

    // If gap2 was found as related to gap1, it should not be a primary suggestion
    for (const result of results) {
      for (const relatedGap of result.relatedGaps) {
        const appearsAsPrimary = primaryQuestions.filter(
          (q) => q === relatedGap.question,
        ).length;
        expect(appearsAsPrimary).toBe(0);
      }
    }
  });

  it('handles empty gaps list', async () => {
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });
    mockSearchAurora.mockResolvedValue([]);
    mockCreate.mockResolvedValue(defaultClaudeResponse());
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const results = await suggestResearchBatch();

    expect(results).toHaveLength(0);
  });
});
