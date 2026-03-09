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

const mockRemember = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  remember: (...args: unknown[]) => mockRemember(...args),
}));

const mockRecordGap = vi.fn();
vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  recordGap: (...args: unknown[]) => mockRecordGap(...args),
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

/** Set up main answer mock (first Claude call) and optionally learn mock (second call). */
function setupClaudeMocks(answerText: string, learnResponse?: string): void {
  if (learnResponse) {
    // First call returns the answer, second call returns fact extraction
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: answerText }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: learnResponse }],
      });
  } else {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: answerText }],
    });
  }
  mockCreateAgentClient.mockReturnValue({
    client: { messages: { create: mockCreate } },
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ask() with learn option', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemember.mockResolvedValue({ action: 'created', nodeId: 'new-1' });
    mockRecordGap.mockResolvedValue(undefined);
  });

  it('extracts and saves facts when learn=true', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMocks(
      'TypeScript was created by Microsoft in 2012.',
      '["TypeScript was created by Microsoft", "TypeScript was released in 2012"]',
    );

    const result = await ask('Tell me about TypeScript', { learn: true });

    expect(result.factsLearned).toBeDefined();
    expect(result.factsLearned).toHaveLength(2);
    expect(mockRemember).toHaveBeenCalledTimes(2);
    expect(mockRemember).toHaveBeenCalledWith(
      'TypeScript was created by Microsoft',
      expect.objectContaining({ type: 'fact', source: 'auto-extracted' }),
    );
  });

  it('does not extract facts when learn is not set', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMocks('Some answer');

    const result = await ask('Question?');

    expect(result.factsLearned).toBeUndefined();
    // Only ONE Claude call (the main answer), not two
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('returns answer even when fact extraction fails', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    // First call succeeds (answer), second call throws (learn)
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Good answer' }],
      })
      .mockRejectedValueOnce(new Error('Haiku failed'));
    mockCreateAgentClient.mockReturnValue({
      client: { messages: { create: mockCreate } },
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 8192,
    });

    const result = await ask('Question?', { learn: true });

    expect(result.answer).toBe('Good answer');
    expect(result.noSourcesFound).toBe(false);
    // factsLearned should be undefined since learning failed
    expect(result.factsLearned).toBeUndefined();
  });

  it('handles empty facts array from Claude', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMocks('No clear facts here.', '[]');

    const result = await ask('Question?', { learn: true });

    expect(result.answer).toBe('No clear facts here.');
    // factsLearned should be empty array (or not present if we spread conditionally)
    expect(mockRemember).not.toHaveBeenCalled();
  });

  it('limits facts to max 5', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMocks(
      'Many facts here.',
      '["fact1", "fact2", "fact3", "fact4", "fact5", "fact6", "fact7"]',
    );

    await ask('Question?', { learn: true });

    expect(mockRemember).toHaveBeenCalledTimes(5);
  });
});

describe('ask() with recordGap integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordGap.mockResolvedValue(undefined);
  });

  it('calls recordGap when no sources found', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([]);

    await ask('What is quantum physics?');

    expect(mockRecordGap).toHaveBeenCalledWith('What is quantum physics?');
  });

  it('does not call recordGap when sources are found', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([makeResult()]);
    setupClaudeMocks('Answer');

    await ask('Question with sources');

    expect(mockRecordGap).not.toHaveBeenCalled();
  });

  it('returns answer even when recordGap fails', async () => {
    const { ask } = await import('../../src/aurora/ask.js');
    mockSearchAurora.mockResolvedValue([]);
    mockRecordGap.mockRejectedValue(new Error('DB error'));

    const result = await ask('Failing gap question');

    expect(result.noSourcesFound).toBe(true);
    expect(result.answer).toContain('Inga relevanta källor');
  });
});
