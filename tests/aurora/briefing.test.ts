import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
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
const mockCreateAgentClient = vi.fn(() => ({
  client: { messages: { create: mockCreate } },
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 512,
}));
vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: (...args: unknown[]) => mockCreateAgentClient(...args),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: () => ({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 128000,
  }),
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxTokens: 128000,
  },
}));

// Import AFTER mocks
import { briefing } from '../../src/aurora/briefing.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultRecallResult() {
  return {
    memories: [
      {
        id: 'mem-1',
        title: 'TypeScript strict mode',
        type: 'fact',
        text: 'TypeScript strict mode prevents type errors',
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
  };
}

function defaultSearchResult() {
  return [
    {
      id: 'search-1',
      title: 'TypeScript Best Practices',
      type: 'document',
      similarity: 0.85,
      confidence: 0.9,
      scope: 'shared',
      source: 'semantic' as const,
    },
  ];
}

function defaultGapsResult() {
  return {
    gaps: [
      {
        question: 'What are TypeScript testing patterns?',
        askedAt: '2026-03-09T09:00:00Z',
        frequency: 2,
      },
    ],
    totalUnanswered: 1,
  };
}

function defaultUnifiedSearchResult() {
  return {
    neuronResults: [
      {
        node: { id: 'n-1', title: 'strict-mode-enforcement', type: 'pattern', confidence: 0.9 },
        source: 'neuron' as const,
        similarity: 0.89,
      },
    ],
    auroraResults: [
      {
        node: { id: 'a-1', title: 'TypeScript Best Practices', type: 'document', confidence: 0.9 },
        source: 'aurora' as const,
        similarity: 0.92,
      },
    ],
    crossRefs: [],
  };
}

function defaultClaudeResponse() {
  return {
    content: [
      { type: 'text', text: 'Vi har 1 fakta om TypeScript. Inga kunskapsluckor identifierade.' },
    ],
  };
}

function setupDefaultMocks() {
  mockRecall.mockResolvedValue(defaultRecallResult());
  mockSearchAurora.mockResolvedValue(defaultSearchResult());
  mockGetGaps.mockResolvedValue(defaultGapsResult());
  mockUnifiedSearch.mockResolvedValue(defaultUnifiedSearchResult());
  mockCheckCrossRefIntegrity.mockResolvedValue([]);
  mockCreate.mockResolvedValue(defaultClaudeResponse());
}

/* ------------------------------------------------------------------ */
/*  briefing() tests                                                   */
/* ------------------------------------------------------------------ */

describe('briefing()', () => {
  beforeEach(() => {
    mockRecall.mockReset();
    mockSearchAurora.mockReset();
    mockGetGaps.mockReset();
    mockUnifiedSearch.mockReset();
    mockCheckCrossRefIntegrity.mockReset();
    mockCreate.mockReset();
    mockCreateAgentClient.mockClear();
  });

  // Test 1: returns BriefingResult with all fields
  it('returns BriefingResult with all fields', async () => {
    setupDefaultMocks();
    const result = await briefing('TypeScript');

    expect(result.topic).toBe('TypeScript');
    expect(result.summary).toContain('fakta');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0].title).toBe('TypeScript strict mode');
    expect(result.facts[0].similarity).toBe(0.92);
    expect(result.facts[0].confidence).toBe(0.8);
    expect(result.timeline).toHaveLength(1);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].question).toContain('TypeScript');
    expect(result.crossRefs.neuron).toHaveLength(1);
    expect(result.crossRefs.aurora).toHaveLength(1);
    expect(result.metadata.generatedAt).toBeDefined();
    expect(result.metadata.totalSources).toBe(2); // 1 fact + 1 timeline
    expect(result.metadata.totalGaps).toBe(1);
    expect(result.metadata.totalCrossRefs).toBe(2); // 1 neuron + 1 aurora
  });

  // Test 2: handles empty facts (no recall results)
  it('handles topic with no facts', async () => {
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });
    mockSearchAurora.mockResolvedValue([]);
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });
    mockUnifiedSearch.mockResolvedValue({ neuronResults: [], auroraResults: [], crossRefs: [] });
    mockCheckCrossRefIntegrity.mockResolvedValue([]);
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '' }],
    });

    const result = await briefing('nonexistent');

    expect(result.facts).toHaveLength(0);
    expect(result.summary).toContain('Inga fakta');
    expect(result.summary).toContain('nonexistent');
  });

  // Test 3: handles empty gaps
  it('handles topic with no matching gaps', async () => {
    setupDefaultMocks();
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });

    const result = await briefing('TypeScript');

    expect(result.gaps).toHaveLength(0);
    expect(result.metadata.totalGaps).toBe(0);
  });

  // Test 4: handles empty cross-refs
  it('handles topic with no cross-refs', async () => {
    setupDefaultMocks();
    mockUnifiedSearch.mockResolvedValue({ neuronResults: [], auroraResults: [], crossRefs: [] });

    const result = await briefing('TypeScript');

    expect(result.crossRefs.neuron).toHaveLength(0);
    expect(result.crossRefs.aurora).toHaveLength(0);
    expect(result.metadata.totalCrossRefs).toBe(0);
  });

  // Test 5: respects maxFacts option
  it('respects custom options', async () => {
    setupDefaultMocks();

    await briefing('TypeScript', { maxFacts: 3, maxTimeline: 5, maxGaps: 2, maxCrossRefs: 1 });

    expect(mockRecall).toHaveBeenCalledWith('TypeScript', expect.objectContaining({ limit: 3 }));
    expect(mockSearchAurora).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ limit: 5 }),
    );
    expect(mockGetGaps).toHaveBeenCalledWith(2);
    expect(mockUnifiedSearch).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ limit: 1 }),
    );
  });

  // Test 6: generates summary via Claude
  it('generates summary via Claude', async () => {
    setupDefaultMocks();

    const result = await briefing('TypeScript');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: expect.stringContaining('kunskapsrapport'),
      }),
    );
    expect(result.summary).toBeTruthy();
  });

  // Test 7: runs all 4 searches in parallel (verify all mocks called)
  it('runs recall, searchAurora, getGaps, unifiedSearch', async () => {
    setupDefaultMocks();

    await briefing('TypeScript');

    expect(mockRecall).toHaveBeenCalledTimes(1);
    expect(mockSearchAurora).toHaveBeenCalledTimes(1);
    expect(mockGetGaps).toHaveBeenCalledTimes(1);
    expect(mockUnifiedSearch).toHaveBeenCalledTimes(1);
  });

  // Test 8: metadata has correct counts
  it('metadata has correct totalSources, totalGaps, totalCrossRefs', async () => {
    setupDefaultMocks();

    const result = await briefing('TypeScript');

    expect(result.metadata.totalSources).toBe(result.facts.length + result.timeline.length);
    expect(result.metadata.totalGaps).toBe(result.gaps.length);
    expect(result.metadata.totalCrossRefs).toBe(
      result.crossRefs.neuron.length + result.crossRefs.aurora.length,
    );
  });

  // Test 9: gap filtering — gaps matching topic by keyword
  it('filters gaps by topic keyword', async () => {
    setupDefaultMocks();
    mockGetGaps.mockResolvedValue({
      gaps: [
        {
          question: 'What are TypeScript testing patterns?',
          askedAt: '2026-03-09T09:00:00Z',
          frequency: 2,
        },
        {
          question: 'How does Python work?',
          askedAt: '2026-03-08T09:00:00Z',
          frequency: 5,
        },
      ],
      totalUnanswered: 2,
    });

    const result = await briefing('TypeScript');

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].question).toContain('TypeScript');
  });

  // Test 10: gap filtering — falls back to most frequent when no match
  it('falls back to most frequent gaps when no keyword match', async () => {
    setupDefaultMocks();
    mockGetGaps.mockResolvedValue({
      gaps: [
        { question: 'How does Python work?', askedAt: '2026-03-08T09:00:00Z', frequency: 5 },
        { question: 'What is Rust?', askedAt: '2026-03-07T09:00:00Z', frequency: 3 },
        { question: 'How to use Go?', askedAt: '2026-03-06T09:00:00Z', frequency: 1 },
        { question: 'Java patterns?', askedAt: '2026-03-05T09:00:00Z', frequency: 1 },
      ],
      totalUnanswered: 4,
    });

    const result = await briefing('TypeScript');

    // No gaps match "TypeScript", so fall back to top 3 most frequent
    expect(result.gaps).toHaveLength(3);
  });

  // Test 11: fact text property is included when present
  it('includes text property in facts when present', async () => {
    setupDefaultMocks();

    const result = await briefing('TypeScript');

    expect(result.facts[0].text).toBe('TypeScript strict mode prevents type errors');
  });

  // Test 12: minSimilarity is passed to searches
  it('passes minSimilarity to searches', async () => {
    setupDefaultMocks();

    await briefing('TypeScript', { minSimilarity: 0.5 });

    expect(mockRecall).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ minSimilarity: 0.5 }),
    );
    expect(mockSearchAurora).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ minSimilarity: 0.5 }),
    );
    expect(mockUnifiedSearch).toHaveBeenCalledWith(
      'TypeScript',
      expect.objectContaining({ minSimilarity: 0.5 }),
    );
  });
});
