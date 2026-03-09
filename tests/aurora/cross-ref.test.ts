import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSemanticSearch = vi.fn();
vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: (...args: unknown[]) => mockSemanticSearch(...args),
}));

const mockQuery = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import {
  unifiedSearch,
  createCrossRef,
  getCrossRefs,
  findAuroraMatchesForNeuron,
  findNeuronMatchesForAurora,
} from '../../src/aurora/cross-ref.js';

/* ------------------------------------------------------------------ */
/*  Tests: unifiedSearch                                               */
/* ------------------------------------------------------------------ */

describe('unifiedSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns results from both graphs', async () => {
    mockSemanticSearch
      .mockResolvedValueOnce([
        { id: 'p-1', title: 'Retry Pattern', type: 'pattern', similarity: 0.9, confidence: 0.8, scope: 'universal' },
      ])
      .mockResolvedValueOnce([
        { id: 'doc-1', title: 'Retry Research', type: 'document', similarity: 0.85, confidence: 1.0, scope: 'personal' },
      ]);
    // getCrossRefs queries — return empty
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await unifiedSearch('retry');

    expect(result.neuronResults).toHaveLength(1);
    expect(result.neuronResults[0].node.id).toBe('p-1');
    expect(result.neuronResults[0].source).toBe('neuron');
    expect(result.neuronResults[0].similarity).toBe(0.9);

    expect(result.auroraResults).toHaveLength(1);
    expect(result.auroraResults[0].node.id).toBe('doc-1');
    expect(result.auroraResults[0].source).toBe('aurora');
    expect(result.auroraResults[0].similarity).toBe(0.85);

    // Verify semanticSearch called with correct tables
    expect(mockSemanticSearch).toHaveBeenCalledTimes(2);
    expect(mockSemanticSearch).toHaveBeenCalledWith('retry', expect.objectContaining({ table: 'kg_nodes' }));
    expect(mockSemanticSearch).toHaveBeenCalledWith('retry', expect.objectContaining({ table: 'aurora_nodes' }));
  });

  it('filters by type', async () => {
    mockSemanticSearch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockQuery.mockResolvedValue({ rows: [] });

    await unifiedSearch('test', { type: 'pattern' });

    expect(mockSemanticSearch).toHaveBeenCalledWith('test', expect.objectContaining({ type: 'pattern' }));
  });

  it('handles empty graphs', async () => {
    mockSemanticSearch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await unifiedSearch('nothing');

    expect(result.neuronResults).toHaveLength(0);
    expect(result.auroraResults).toHaveLength(0);
    expect(result.crossRefs).toHaveLength(0);
  });

  it('attaches existing cross-refs to matches', async () => {
    mockSemanticSearch
      .mockResolvedValueOnce([
        { id: 'p-1', title: 'Pattern', type: 'pattern', similarity: 0.9, confidence: 0.8, scope: 'universal' },
      ])
      .mockResolvedValueOnce([]);
    // getCrossRefs for p-1 returns a cross-ref
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        neuron_node_id: 'p-1',
        aurora_node_id: 'doc-1',
        relationship: 'enriches',
        similarity: 0.85,
        metadata: {},
        created_at: new Date('2024-01-01T00:00:00.000Z'),
      }],
    });

    const result = await unifiedSearch('pattern');

    expect(result.neuronResults[0].existingRef).toBeDefined();
    expect(result.neuronResults[0].existingRef!.neuronNodeId).toBe('p-1');
    expect(result.crossRefs).toHaveLength(1);
  });

  it('uses default options when none provided', async () => {
    mockSemanticSearch.mockResolvedValue([]);
    mockQuery.mockResolvedValue({ rows: [] });

    await unifiedSearch('test');

    expect(mockSemanticSearch).toHaveBeenCalledWith('test', expect.objectContaining({
      limit: 10,
      minSimilarity: 0.3,
    }));
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: createCrossRef                                              */
/* ------------------------------------------------------------------ */

describe('createCrossRef', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a cross-ref row', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        neuron_node_id: 'p-1',
        aurora_node_id: 'doc-1',
        relationship: 'supports',
        similarity: 0.9,
        metadata: {},
        created_at: new Date('2024-01-01T00:00:00.000Z'),
      }],
    });

    const ref = await createCrossRef('p-1', 'doc-1', 'supports', 0.9);

    expect(ref.neuronNodeId).toBe('p-1');
    expect(ref.auroraNodeId).toBe('doc-1');
    expect(ref.relationship).toBe('supports');
    expect(ref.similarity).toBe(0.9);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    // Verify INSERT ... ON CONFLICT query
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO cross_refs');
    expect(sql).toContain('ON CONFLICT');
  });

  it('upserts on duplicate (ON CONFLICT)', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        neuron_node_id: 'p-1',
        aurora_node_id: 'doc-1',
        relationship: 'enriches',
        similarity: 0.95,
        metadata: { updated: true },
        created_at: new Date('2024-01-01T00:00:00.000Z'),
      }],
    });

    const ref = await createCrossRef('p-1', 'doc-1', 'enriches', 0.95, { updated: true });

    expect(ref.similarity).toBe(0.95);
    expect(ref.metadata).toEqual({ updated: true });
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: getCrossRefs                                                */
/* ------------------------------------------------------------------ */

describe('getCrossRefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cross-refs for a Neuron node', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 1,
        neuron_node_id: 'p-1',
        aurora_node_id: 'doc-1',
        relationship: 'enriches',
        similarity: 0.85,
        metadata: {},
        created_at: new Date('2024-01-01T00:00:00.000Z'),
      }],
    });

    const refs = await getCrossRefs('p-1');

    expect(refs).toHaveLength(1);
    expect(refs[0].neuronNodeId).toBe('p-1');
    expect(refs[0].auroraNodeId).toBe('doc-1');
    // Verify query uses OR for both columns
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('neuron_node_id');
    expect(sql).toContain('aurora_node_id');
  });

  it('returns cross-refs for an Aurora node', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        id: 2,
        neuron_node_id: 'p-2',
        aurora_node_id: 'doc-1',
        relationship: 'supports',
        similarity: 0.75,
        metadata: {},
        created_at: new Date('2024-01-01T00:00:00.000Z'),
      }],
    });

    const refs = await getCrossRefs('doc-1');

    expect(refs).toHaveLength(1);
    expect(refs[0].auroraNodeId).toBe('doc-1');
  });

  it('returns empty array when no refs exist', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const refs = await getCrossRefs('nonexistent');

    expect(refs).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: findAuroraMatchesForNeuron                                  */
/* ------------------------------------------------------------------ */

describe('findAuroraMatchesForNeuron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds related Aurora nodes', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 'doc-1', title: 'Research Doc', type: 'document', confidence: 1.0, similarity: 0.88 },
        { id: 'fact-1', title: 'Known Fact', type: 'fact', confidence: 0.9, similarity: 0.72 },
      ],
    });

    const matches = await findAuroraMatchesForNeuron('p-1');

    expect(matches).toHaveLength(2);
    expect(matches[0].node.id).toBe('doc-1');
    expect(matches[0].source).toBe('aurora');
    expect(matches[0].similarity).toBe(0.88);
    expect(matches[1].node.id).toBe('fact-1');
    // Verify SQL queries aurora_nodes using kg_nodes embedding
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('aurora_nodes');
    expect(sql).toContain('kg_nodes');
  });

  it('uses default limit of 5 and minSimilarity of 0.5', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await findAuroraMatchesForNeuron('p-1');

    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(0.5);  // minSimilarity
    expect(params).toContain(5);    // limit
  });

  it('accepts custom options', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await findAuroraMatchesForNeuron('p-1', { limit: 3, minSimilarity: 0.7 });

    const params = mockQuery.mock.calls[0][1];
    expect(params).toContain(0.7);
    expect(params).toContain(3);
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: findNeuronMatchesForAurora                                  */
/* ------------------------------------------------------------------ */

describe('findNeuronMatchesForAurora', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds related Neuron nodes', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        { id: 'p-1', title: 'Retry Pattern', type: 'pattern', confidence: 0.8, similarity: 0.91 },
      ],
    });

    const matches = await findNeuronMatchesForAurora('doc-1');

    expect(matches).toHaveLength(1);
    expect(matches[0].node.id).toBe('p-1');
    expect(matches[0].source).toBe('neuron');
    expect(matches[0].similarity).toBe(0.91);
    // Verify SQL queries kg_nodes using aurora_nodes embedding
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('kg_nodes');
    expect(sql).toContain('aurora_nodes');
  });

  it('returns empty when no matches', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const matches = await findNeuronMatchesForAurora('doc-1');

    expect(matches).toHaveLength(0);
  });
});
