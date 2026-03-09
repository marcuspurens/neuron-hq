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

import { recordGap, getGaps } from '../../src/aurora/knowledge-gaps.js';

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

function makeGraph(nodes: AuroraNode[] = []): AuroraGraph {
  return {
    nodes,
    edges: [],
    lastUpdated: new Date().toISOString(),
  };
}

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
    expect(result.gaps[1].frequency).toBe(3);
    expect(result.gaps[2].frequency).toBe(1);
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
