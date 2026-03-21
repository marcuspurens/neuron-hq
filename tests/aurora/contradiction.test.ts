import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph, AuroraNode } from '../../src/aurora/aurora-schema.js';
import type { SearchResult } from '../../src/aurora/search.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSearchAurora = vi.fn();
vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
}));

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAddAuroraNode = vi.fn();
const mockAddAuroraEdge = vi.fn();
const mockUpdateAuroraNode = vi.fn();
const mockFindAuroraNodes = vi.fn();
const mockTraverseAurora = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  addAuroraNode: (...args: unknown[]) => mockAddAuroraNode(...args),
  addAuroraEdge: (...args: unknown[]) => mockAddAuroraEdge(...args),
  updateAuroraNode: (...args: unknown[]) => mockUpdateAuroraNode(...args),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
  traverseAurora: (...args: unknown[]) => mockTraverseAurora(...args),
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
    maxTokens: 16384,
  }),
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic' as const,
    model: 'claude-opus-4-6',
    maxTokens: 16384,
  },
}));

import { remember } from '../../src/aurora/memory.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGraph(nodes: AuroraNode[] = [], edges: AuroraGraph['edges'] = []): AuroraGraph {
  return { nodes, edges, lastUpdated: new Date().toISOString() };
}

function makeNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'node-1',
    type: 'fact',
    title: 'Test fact',
    properties: { text: 'Some text', tags: [], source: null },
    confidence: 0.7,
    scope: 'personal',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'node-1',
    title: 'Test fact',
    type: 'fact',
    similarity: 0.9,
    confidence: 0.7,
    scope: 'personal',
    source: 'semantic',
    ...overrides,
  };
}

function setupContradictionMock(contradicts: boolean, reason: string = 'They conflict'): void {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ contradicts, reason }) }],
  });
  mockCreateAgentClient.mockReturnValue({
    client: { messages: { create: mockCreate } },
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 16384,
  });
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
  mockTraverseAurora.mockReturnValue([]);
  mockFindAuroraNodes.mockReturnValue([]);
  mockAddAuroraNode.mockImplementation((graph: AuroraGraph) => graph);
  mockAddAuroraEdge.mockImplementation((graph: AuroraGraph) => graph);
  mockUpdateAuroraNode.mockImplementation((graph: AuroraGraph) => graph);
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('remember() contradiction detection', () => {
  it('creates contradicts edge when contradiction is detected', async () => {
    const existingNode = makeNode({
      id: 'existing-1',
      title: 'TypeScript is better than Python',
      properties: { text: 'TypeScript is better than Python', tags: [], source: null },
    });
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'existing-1', title: 'TypeScript is better than Python', similarity: 0.6 }),
    ]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingNode]));
    setupContradictionMock(true, 'These statements directly oppose each other');

    const result = await remember('Python is better than TypeScript');

    expect(result.action).toBe('created');
    expect(result.contradictions).toBeDefined();
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions![0].nodeId).toBe('existing-1');
    expect(result.contradictions![0].reason).toContain('oppose');

    // Check that the edge is 'contradicts', not 'related_to'
    expect(mockAddAuroraEdge).toHaveBeenCalled();
    const edgeArg = mockAddAuroraEdge.mock.calls.find(
      (call: unknown[]) => (call[1] as { to: string }).to === 'existing-1',
    );
    expect(edgeArg).toBeDefined();
    expect((edgeArg![1] as { type: string }).type).toBe('contradicts');
  });

  it('creates related_to edge when no contradiction', async () => {
    const existingNode = makeNode({
      id: 'existing-1',
      title: 'TypeScript has strict mode',
      properties: { text: 'TypeScript has strict mode', tags: [], source: null },
    });
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'existing-1', title: 'TypeScript has strict mode', similarity: 0.6 }),
    ]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingNode]));
    setupContradictionMock(false, 'Not contradicting');

    const result = await remember('TypeScript supports generics');

    expect(result.action).toBe('created');
    expect(result.contradictions).toBeUndefined();

    // Edge should be 'related_to'
    expect(mockAddAuroraEdge).toHaveBeenCalled();
    const edgeArg = mockAddAuroraEdge.mock.calls.find(
      (call: unknown[]) => (call[1] as { to: string }).to === 'existing-1',
    );
    expect(edgeArg).toBeDefined();
    expect((edgeArg![1] as { type: string }).type).toBe('related_to');
  });

  it('falls back to related_to edge when Haiku fails', async () => {
    const existingNode = makeNode({ id: 'existing-1', properties: { text: 'Some fact', tags: [], source: null } });
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'existing-1', similarity: 0.6 }),
    ]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingNode]));
    mockCreateAgentClient.mockImplementation(() => {
      throw new Error('API unavailable');
    });

    const result = await remember('A new fact');

    expect(result.action).toBe('created');
    // No contradictions since check failed
    expect(result.contradictions).toBeUndefined();
    // Edge should still be created as related_to
    expect(mockAddAuroraEdge).toHaveBeenCalled();
    const edgeArg = mockAddAuroraEdge.mock.calls[0][1];
    expect(edgeArg.type).toBe('related_to');
  });

  it('does not call Claude when no candidates with similarity >= 0.5', async () => {
    mockSearchAurora.mockResolvedValue([]);

    const result = await remember('Completely new fact');

    expect(result.action).toBe('created');
    expect(mockCreateAgentClient).not.toHaveBeenCalled();
    expect(result.contradictions).toBeUndefined();
  });

  it('checks max 3 candidates', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeNode({ id: `n${i}`, properties: { text: `Fact ${i}`, tags: [], source: null } }),
    );
    mockSearchAurora.mockResolvedValue(
      nodes.map((n, i) => makeSearchResult({ id: n.id, similarity: 0.5 + i * 0.05 })),
    );
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));
    setupContradictionMock(false);

    await remember('Test fact');

    // Should call Claude at most 3 times for contradiction check
    expect(mockCreate.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('includes correct fields in RememberResult.contradictions', async () => {
    const existingNode = makeNode({
      id: 'c-node',
      title: 'Dogs are better than cats',
      properties: { text: 'Dogs are better than cats', tags: [], source: null },
    });
    mockSearchAurora.mockResolvedValue([
      makeSearchResult({ id: 'c-node', title: 'Dogs are better than cats', similarity: 0.7 }),
    ]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingNode]));
    setupContradictionMock(true, 'Opposite preferences');

    const result = await remember('Cats are better than dogs');

    expect(result.contradictions).toHaveLength(1);
    const contradiction = result.contradictions![0];
    expect(contradiction.nodeId).toBe('c-node');
    expect(contradiction.title).toBe('Dogs are better than cats');
    expect(contradiction.similarity).toBe(0.7);
    expect(contradiction.reason).toBe('Opposite preferences');
  });
});
