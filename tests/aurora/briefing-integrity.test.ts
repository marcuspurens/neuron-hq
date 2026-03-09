import { describe, it, expect, vi } from 'vitest';

// Mock all external dependencies
const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn(),
}));

vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/aurora/memory.js', () => ({
  recall: vi.fn().mockResolvedValue({ memories: [], totalCount: 0 }),
}));

vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: vi.fn().mockResolvedValue({ gaps: [], totalCount: 0 }),
}));

vi.mock('../../src/aurora/cross-ref.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/aurora/cross-ref.js')>();
  return {
    ...mod,
    unifiedSearch: vi.fn().mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    }),
    checkCrossRefIntegrity: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: () => ({
    client: {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Test summary' }],
        }),
      },
    },
    model: 'test-model',
  }),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: () => ({
    model: 'test-model',
    maxTokens: 1024,
    temperature: 0,
    provider: 'anthropic',
    apiKey: 'test',
  }),
  DEFAULT_MODEL_CONFIG: {
    model: 'test-model',
    maxTokens: 1024,
    temperature: 0,
    provider: 'anthropic',
    apiKey: 'test',
  },
}));

import { briefing } from '../../src/aurora/briefing.js';
import { checkCrossRefIntegrity } from '../../src/aurora/cross-ref.js';

describe('briefing with integrity issues', () => {
  it('includes integrityIssues in result', async () => {
    const result = await briefing('test topic');
    expect(result).toHaveProperty('integrityIssues');
    expect(Array.isArray(result.integrityIssues)).toBe(true);
  });

  it('maps integrity issues from checkCrossRefIntegrity', async () => {
    vi.mocked(checkCrossRefIntegrity).mockResolvedValueOnce([
      {
        crossRefId: 1,
        neuronNodeId: 'n1',
        neuronTitle: 'Weak Pattern',
        neuronConfidence: 0.2,
        auroraNodeId: 'a1',
        auroraTitle: 'Research Doc',
        issue: 'low_confidence',
      },
    ]);

    const result = await briefing('test topic');
    expect(result.integrityIssues).toHaveLength(1);
    expect(result.integrityIssues[0].neuronTitle).toBe('Weak Pattern');
    expect(result.integrityIssues[0].neuronConfidence).toBe(0.2);
    expect(result.integrityIssues[0].auroraTitle).toBe('Research Doc');
    expect(result.integrityIssues[0].issue).toBe('low_confidence');
  });

  it('returns empty integrityIssues on error', async () => {
    vi.mocked(checkCrossRefIntegrity).mockRejectedValueOnce(
      new Error('DB not available'),
    );

    const result = await briefing('test topic');
    expect(result.integrityIssues).toHaveLength(0);
  });
});
