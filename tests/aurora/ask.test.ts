import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SearchResult } from '../../src/aurora/search.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSearchAurora = vi.fn();
vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
}));

const mockCreate = vi.fn();
const mockCreateAgentClient = vi.fn();
vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: (...args: unknown[]) => mockCreateAgentClient(...args),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: () => ({
    provider: 'anthropic' as const,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
  }),
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic' as const,
    model: 'claude-opus-4-6',
    maxTokens: 8192,
  },
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'node-1',
    title: 'Test Pattern',
    type: 'pattern',
    similarity: 0.87,
    confidence: 0.9,
    scope: 'universal',
    text: 'This is some knowledge content.',
    source: 'semantic',
    ...overrides,
  };
}

function setupClaudeMock(answerText: string): void {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: answerText }],
  });
  mockCreateAgentClient.mockReturnValue({
    client: { messages: { create: mockCreate } },
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('formatContext', () => {
  it('formats a semantic result with similarity score', async () => {
    const { formatContext } = await import('../../src/aurora/ask.js');
    const results: SearchResult[] = [
      makeResult({ title: 'My Pattern', similarity: 0.87 }),
    ];
    const output = formatContext(results);
    expect(output).toContain('[Source 1: "My Pattern" (pattern, similarity: 0.87)]');
    expect(output).toContain('This is some knowledge content.');
  });

  it('formats a keyword result with "keyword match"', async () => {
    const { formatContext } = await import('../../src/aurora/ask.js');
    const results: SearchResult[] = [
      makeResult({ similarity: null, source: 'keyword' }),
    ];
    const output = formatContext(results);
    expect(output).toContain('keyword match');
    expect(output).not.toContain('similarity:');
  });

  it('shows "(no text content)" when text is missing', async () => {
    const { formatContext } = await import('../../src/aurora/ask.js');
    const results: SearchResult[] = [
      makeResult({ text: undefined }),
    ];
    const output = formatContext(results);
    expect(output).toContain('(no text content)');
  });

  it('numbers multiple sources sequentially', async () => {
    const { formatContext } = await import('../../src/aurora/ask.js');
    const results: SearchResult[] = [
      makeResult({ id: 'a', title: 'First' }),
      makeResult({ id: 'b', title: 'Second', similarity: 0.65 }),
    ];
    const output = formatContext(results);
    expect(output).toContain('[Source 1: "First"');
    expect(output).toContain('[Source 2: "Second"');
  });
});

describe('ask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no-sources response when search yields 0 results', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([]);

    const result = await ask('What is X?');

    expect(result.noSourcesFound).toBe(true);
    expect(result.sourcesUsed).toBe(0);
    expect(result.citations).toEqual([]);
    expect(result.answer).toContain('Inga relevanta källor');
    // Should NOT call Claude
    expect(mockCreateAgentClient).not.toHaveBeenCalled();
  });

  it('calls searchAurora with correct options', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMock('The answer is 42.');

    await ask('What is X?', { maxSources: 5, minSimilarity: 0.5, type: 'pattern', scope: 'universal' });

    expect(mockSearchAurora).toHaveBeenCalledWith('What is X?', {
      limit: 5,
      minSimilarity: 0.5,
      type: 'pattern',
      scope: 'universal',
      includeRelated: false,
    });
  });

  it('calls Claude and returns answer with citations', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([
      makeResult({ id: 'n1', title: 'Pattern A', similarity: 0.9 }),
    ]);
    setupClaudeMock('Based on [Source 1], the answer is clear.');

    const result = await ask('What is X?');

    expect(result.noSourcesFound).toBe(false);
    expect(result.sourcesUsed).toBe(1);
    expect(result.answer).toBe('Based on [Source 1], the answer is clear.');
    expect(result.citations).toEqual([
      { nodeId: 'n1', title: 'Pattern A', type: 'pattern', similarity: 0.9 },
    ]);
  });

  it('uses default maxTokens of 1024 for Claude call', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMock('Answer');

    await ask('Question?');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 1024 }),
    );
  });

  it('uses custom maxTokens when provided', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMock('Answer');

    await ask('Question?', { maxTokens: 2048 });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 }),
    );
  });

  it('handles Claude API errors gracefully', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    mockCreateAgentClient.mockImplementation(() => {
      throw new Error('API key missing');
    });

    const result = await ask('Question?');

    expect(result.answer).toContain('Fel vid generering av svar');
    expect(result.answer).toContain('API key missing');
    expect(result.sourcesUsed).toBe(1);
    expect(result.noSourcesFound).toBe(false);
  });

  it('handles null similarity in citations by defaulting to 0', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([
      makeResult({ id: 'n2', similarity: null, source: 'keyword' }),
    ]);
    setupClaudeMock('Answer');

    const result = await ask('Question?');

    expect(result.citations[0].similarity).toBe(0);
  });
});
