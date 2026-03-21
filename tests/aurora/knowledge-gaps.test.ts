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
    maxTokens: 16384,
  }),
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxTokens: 16384,
  },
}));

const mockReadFile = vi.fn();
vi.mock('fs/promises', () => ({
  default: { readFile: (...args: unknown[]) => mockReadFile(...args) },
}));

import {
  recordGap,
  getGaps,
  resolveGap,
  extractEmergentGaps,
} from '../../src/aurora/knowledge-gaps.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGapNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'gap-1',
    type: 'research',
    title: 'What is quantum physics?',
    properties: { text: 'What is quantum physics?', gapType: 'unanswered', frequency: 1 },
    confidence: 0.5,
    scope: 'personal',
    created: '2026-03-09T12:00:00.000Z',
    updated: '2026-03-09T12:00:00.000Z',
    ...overrides,
  };
}

function makeDocNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'doc-1',
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
  const emptyGraph = makeGraph();
  mockLoadAuroraGraph.mockResolvedValue(emptyGraph);
  mockSaveAuroraGraph.mockResolvedValue(undefined);
  mockSearchAurora.mockResolvedValue([]);
  mockFindAuroraNodes.mockReturnValue([]);
  mockAddAuroraNode.mockImplementation((graph: AuroraGraph) => graph);
  mockUpdateAuroraNode.mockImplementation((graph: AuroraGraph) => graph);
  mockReadFile.mockResolvedValue(PROMPT_TEMPLATE);
});

/* ------------------------------------------------------------------ */
/*  recordGap() tests                                                  */
/* ------------------------------------------------------------------ */

describe('recordGap()', () => {
  it('creates a new research node for first-time question', async () => {
    mockSearchAurora.mockResolvedValue([]);

    await recordGap('What is quantum physics?');

    expect(mockAddAuroraNode).toHaveBeenCalledOnce();
    const nodeArg = mockAddAuroraNode.mock.calls[0][1];
    expect(nodeArg.type).toBe('research');
    expect(nodeArg.properties.gapType).toBe('unanswered');
    expect(nodeArg.properties.frequency).toBe(1);
    expect(nodeArg.properties.text).toBe('What is quantum physics?');
    expect(nodeArg.confidence).toBe(0.5);
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('increments frequency for repeated question', async () => {
    const existingGap = makeGapNode({
      id: 'gap-1',
      properties: { text: 'What is quantum physics?', gapType: 'unanswered', frequency: 2 },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingGap]));
    mockSearchAurora.mockResolvedValue([
      {
        id: 'gap-1',
        title: 'What is quantum physics?',
        type: 'research',
        similarity: 0.85,
        confidence: 0.5,
        scope: 'personal',
        source: 'semantic',
      },
    ]);

    await recordGap('What is quantum physics?');

    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateArgs = mockUpdateAuroraNode.mock.calls[0];
    expect(updateArgs[1]).toBe('gap-1');
    expect(updateArgs[2].properties.frequency).toBe(3);
    expect(mockAddAuroraNode).not.toHaveBeenCalled();
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('falls back to keyword search when searchAurora fails', async () => {
    mockSearchAurora.mockRejectedValue(new Error('DB error'));
    mockFindAuroraNodes.mockReturnValue([]);

    await recordGap('Test question');

    expect(mockFindAuroraNodes).toHaveBeenCalledOnce();
    expect(mockAddAuroraNode).toHaveBeenCalledOnce();
  });

  it('ignores non-gap research nodes in search results', async () => {
    const nonGapNode = makeGapNode({
      id: 'research-1',
      properties: { text: 'Some research', gapType: 'completed' },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([nonGapNode]));
    mockSearchAurora.mockResolvedValue([
      {
        id: 'research-1',
        title: 'Some research',
        type: 'research',
        similarity: 0.9,
        confidence: 0.5,
        scope: 'personal',
        source: 'semantic',
      },
    ]);

    await recordGap('Some research topic');

    // Should create new node since the existing one is not a gap
    expect(mockAddAuroraNode).toHaveBeenCalledOnce();
  });
});

/* ------------------------------------------------------------------ */
/*  getGaps() tests                                                    */
/* ------------------------------------------------------------------ */

describe('getGaps()', () => {
  it('returns gap nodes sorted by frequency', async () => {
    const nodes = [
      makeGapNode({ id: 'g1', properties: { text: 'Q1', gapType: 'unanswered', frequency: 1 } }),
      makeGapNode({ id: 'g2', properties: { text: 'Q2', gapType: 'unanswered', frequency: 5 } }),
      makeGapNode({ id: 'g3', properties: { text: 'Q3', gapType: 'unanswered', frequency: 3 } }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await getGaps();

    expect(result.gaps).toHaveLength(3);
    expect(result.gaps[0].frequency).toBe(5);
    expect(result.gaps[0].id).toBe('g2');
    expect(result.gaps[1].frequency).toBe(3);
    expect(result.gaps[1].id).toBe('g3');
    expect(result.gaps[2].frequency).toBe(1);
    expect(result.gaps[2].id).toBe('g1');
    expect(result.totalUnanswered).toBe(3);
  });

  it('respects limit', async () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeGapNode({
        id: `g${i}`,
        properties: { text: `Q${i}`, gapType: 'unanswered', frequency: i + 1 },
      }),
    );
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await getGaps(3);

    expect(result.gaps).toHaveLength(3);
    expect(result.totalUnanswered).toBe(10);
  });

  it('handles empty graph', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    const result = await getGaps();

    expect(result.gaps).toHaveLength(0);
    expect(result.totalUnanswered).toBe(0);
  });

  it('excludes non-gap research nodes', async () => {
    const nodes = [
      makeGapNode({ id: 'g1', properties: { text: 'Q1', gapType: 'unanswered', frequency: 1 } }),
      makeGapNode({
        id: 'r1',
        properties: { text: 'Research', gapType: 'completed', frequency: 1 },
      }),
      {
        ...makeGapNode({ id: 'f1' }),
        type: 'fact' as const,
        properties: { text: 'A fact' },
      },
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await getGaps();

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].question).toBe('Q1');
  });

  it('uses title as fallback when text is missing', async () => {
    const node = makeGapNode({
      id: 'g1',
      title: 'My Question',
      properties: { gapType: 'unanswered', frequency: 1 },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));

    const result = await getGaps();

    expect(result.gaps[0].question).toBe('My Question');
  });
});

/* ------------------------------------------------------------------ */
/*  resolveGap() tests                                                 */
/* ------------------------------------------------------------------ */

describe('resolveGap()', () => {
  it('updates gap properties to resolved', async () => {
    const gapNode = makeGapNode({
      id: 'gap-resolve-1',
      properties: { text: 'What is X?', gapType: 'unanswered', frequency: 3 },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([gapNode]));

    await resolveGap('gap-resolve-1', {
      researchedBy: 'knowledge-manager',
      urlsIngested: ['https://example.com/x'],
      factsLearned: 2,
    });

    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateArgs = mockUpdateAuroraNode.mock.calls[0];
    expect(updateArgs[1]).toBe('gap-resolve-1');
    expect(updateArgs[2].properties.gapType).toBe('resolved');
    expect(updateArgs[2].properties.resolvedBy).toBe('knowledge-manager');
    expect(updateArgs[2].properties.resolvedAt).toBeDefined();
    expect(updateArgs[2].properties.evidence).toEqual({
      urlsIngested: ['https://example.com/x'],
      factsLearned: 2,
    });
    expect(mockSaveAuroraGraph).toHaveBeenCalled();
  });

  it('does nothing for non-existent gap', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));
    await resolveGap('nonexistent', {
      researchedBy: 'km',
      urlsIngested: [],
      factsLearned: 0,
    });
    expect(mockUpdateAuroraNode).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  getGaps() — resolved filtering                                     */
/* ------------------------------------------------------------------ */

describe('getGaps() — resolved filtering', () => {
  it('excludes resolved gaps by default', async () => {
    const nodes = [
      makeGapNode({ id: 'g1', properties: { text: 'Q1', gapType: 'unanswered', frequency: 1 } }),
      makeGapNode({ id: 'g2', properties: { text: 'Q2', gapType: 'resolved', frequency: 5 } }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await getGaps();
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].question).toBe('Q1');
  });

  it('includes resolved gaps when includeResolved is true', async () => {
    const nodes = [
      makeGapNode({ id: 'g1', properties: { text: 'Q1', gapType: 'unanswered', frequency: 1 } }),
      makeGapNode({ id: 'g2', properties: { text: 'Q2', gapType: 'resolved', frequency: 5 } }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await getGaps({ includeResolved: true });
    expect(result.gaps).toHaveLength(2);
  });

  it('backwards compatible with number argument', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeGapNode({ id: `g${i}`, properties: { text: `Q${i}`, gapType: 'unanswered', frequency: i + 1 } }),
    );
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await getGaps(2);
    expect(result.gaps).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  extractEmergentGaps() tests                                        */
/* ------------------------------------------------------------------ */

describe('extractEmergentGaps()', () => {
  it('returns empty array when no ingestedNodeIds match graph nodes', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['nonexistent-id'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns empty array when LLM call fails', async () => {
    const node = makeDocNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockRejectedValue(new Error('API rate limit'));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
    });

    expect(result).toEqual([]);
  });

  it('extracts questions from LLM response', async () => {
    const node = makeDocNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'How does quantum error correction work?',
      'What are the practical applications?',
    ]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-origin-1',
    });

    expect(result).toHaveLength(2);
    expect(result[0].question).toBe('How does quantum error correction work?');
    expect(result[1].question).toBe('What are the practical applications?');
  });

  it('filters out questions matching existing gaps (>0.85 similarity)', async () => {
    const node = makeDocNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'What is quantum entanglement?',
      'How fast are quantum computers?',
    ]));

    // First question matches existing gap; second does not
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
    const node = makeDocNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse([
      'Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?', 'Q6?',
    ]));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'gap-1',
      maxGaps: 3,
    });

    expect(result).toHaveLength(3);
  });

  it('returns EmergentGap with correct source and chainedFrom', async () => {
    const node = makeDocNode({ id: 'ingested-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockCreate.mockResolvedValue(makeLLMResponse(['Follow-up Q?']));

    const result = await extractEmergentGaps({
      ingestedNodeIds: ['ingested-1'],
      existingGapIds: [],
      chainedFromGapId: 'chain-origin-42',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      question: 'Follow-up Q?',
      source: 'emergent',
      chainedFrom: 'chain-origin-42',
      confidence: 0.7,
    });
  });
});
