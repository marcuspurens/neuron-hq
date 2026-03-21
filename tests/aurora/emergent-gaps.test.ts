import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph, AuroraNode } from '../../src/aurora/aurora-schema.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAddAuroraNode = vi.fn();
const mockUpdateAuroraNode = vi.fn();
const mockFindAuroraNodes = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  addAuroraNode: (...args: unknown[]) => mockAddAuroraNode(...args),
  updateAuroraNode: (...args: unknown[]) => mockUpdateAuroraNode(...args),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
}));

const mockSearchAurora = vi.fn();
vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
}));

const mockCreate = vi.fn();
const mockCreateAgentClient = vi.fn(() => ({
  client: { messages: { create: mockCreate } },
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 1024,
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

// Mock fs/promises for prompt template reading
const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  default: { readFile: (...args: unknown[]) => mockReadFile(...args) },
}));

// Import AFTER mocks
import { extractEmergentGaps, type EmergentGap } from '../../src/aurora/knowledge-gaps.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'node-1',
    type: 'document',
    title: 'Test Document',
    properties: { text: 'Some ingested text about quantum computing.' },
    confidence: 0.8,
    scope: 'personal',
    created: '2026-03-09T12:00:00.000Z',
    updated: '2026-03-09T12:00:00.000Z',
    ...overrides,
  };
}

function makeGraph(nodes: AuroraNode[] = []): AuroraGraph {
  return {
    nodes,
    edges: [],
    lastUpdated: new Date().toISOString(),
  };
}

function makeLLMResponse(questions: string[]) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ questions }),
    }],
  };
}

const PROMPT_TEMPLATE = 'Analyze this text:\n\n{{text}}\n\nReturn JSON with questions.';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockReadFile.mockResolvedValue(PROMPT_TEMPLATE);
  mockSearchAurora.mockResolvedValue([]);
  mockFindAuroraNodes.mockReturnValue([]);
});

/* ------------------------------------------------------------------ */
/*  extractEmergentGaps() tests                                        */
/* ------------------------------------------------------------------ */

describe('extractEmergentGaps()', () => {
  it('extracts emergent gaps from ingested nodes', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'How does quantum error correction work?',
      'What are the practical applications of quantum computing?',
    ]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-origin-1',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      question: 'How does quantum error correction work?',
      source: 'emergent',
      chainedFrom: 'gap-origin-1',
      confidence: 0.7,
    });
    expect(result[1]).toEqual({
      question: 'What are the practical applications of quantum computing?',
      source: 'emergent',
      chainedFrom: 'gap-origin-1',
      confidence: 0.7,
    });
  });

  it('returns empty array when no ingested nodes found', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['nonexistent-id'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('deduplicates against existing gaps via semantic search', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'What is quantum entanglement?',     // duplicate
      'How fast are quantum computers?',    // unique
    ]));

    // First call (dedup check for question 1) — returns a similar existing gap
    mockSearchAurora
      .mockResolvedValueOnce([{
        id: 'existing-gap-1',
        title: 'What is quantum entanglement?',
        type: 'research',
        similarity: 0.92,
        confidence: 0.5,
        scope: 'personal',
        source: 'semantic',
      }])
      // Second call (dedup check for question 2) — no duplicates
      .mockResolvedValueOnce([]);

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: ['existing-gap-1'],
      chainedFromGapId: 'gap-origin-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('How fast are quantum computers?');
  });

  it('respects maxGaps limit', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'Question 1?',
      'Question 2?',
      'Question 3?',
      'Question 4?',
      'Question 5?',
      'Question 6?',
    ]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
      maxGaps: 3,
    });

    expect(result).toHaveLength(3);
  });

  it('defaults maxGaps to 5', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?', 'Q6?', 'Q7?',
    ]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toHaveLength(5);
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Not valid JSON at all' }],
    });

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toEqual([]);
  });

  it('returns empty array when LLM call fails', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockRejectedValue(new Error('API rate limit'));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toEqual([]);
  });

  it('returns empty array when prompt file read fails', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockReadFile.mockRejectedValue(new Error('ENOENT: file not found'));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toEqual([]);
  });

  it('uses node title as fallback when text is missing', async () => {
    const node = makeNode({
      id: 'ingested-1',
      title: 'Quantum Computing Overview',
      properties: {},
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse(['Follow-up question?']));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toHaveLength(1);
    // Verify prompt was called with node title
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Quantum Computing Overview');
  });

  it('concatenates text from multiple ingested nodes', async () => {
    const nodes = [
      makeNode({ id: 'n1', properties: { text: 'First document text.' } }),
      makeNode({ id: 'n2', properties: { text: 'Second document text.' } }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));
    mockCreate.mockResolvedValue(makeLLMResponse(['A question?']));

    await extractEmergentGaps({
      ingestedNodeIds: ['n1', 'n2'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('First document text.');
    expect(callArgs.messages[0].content).toContain('Second document text.');
  });

  it('keeps questions when searchAurora fails during dedup', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse(['Some question?']));
    mockSearchAurora.mockRejectedValue(new Error('DB unavailable'));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    // Question should be kept since dedup failed gracefully
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('Some question?');
  });

  it('filters out empty questions from LLM response', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'Valid question?',
      '',
      '   ',
      'Another valid question?',
    ]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('Valid question?');
    expect(result[1].question).toBe('Another valid question?');
  });

  it('all returned gaps have source "emergent"', async () => {
    const node = makeNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse(['Q1?', 'Q2?']));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    for (const gap of result) {
      expect(gap.source).toBe('emergent');
      expect(gap.confidence).toBe(0.7);
      expect(gap.chainedFrom).toBe('gap-1');
    }
  });
});
