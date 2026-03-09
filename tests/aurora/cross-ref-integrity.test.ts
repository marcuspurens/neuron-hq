import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB module
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };
vi.mock('../../src/core/db.js', () => ({
  getPool: () => mockPool,
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn(),
}));

// Mock semantic-search (needed by cross-ref module)
vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
}));

import {
  transferCrossRefs,
  checkCrossRefIntegrity,
  createCrossRef,
} from '../../src/aurora/cross-ref.js';

describe('transferCrossRefs', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('transfers cross-refs from removed to kept node', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 2 }) // UPDATE
      .mockResolvedValueOnce({ rowCount: 0 }); // DELETE

    const count = await transferCrossRefs('removed-id', 'kept-id', 'neuron');
    expect(count).toBe(2);
    expect(mockQuery).toHaveBeenCalledTimes(2);

    // Verify UPDATE query uses neuron_node_id
    const updateCall = mockQuery.mock.calls[0];
    expect(updateCall[0]).toContain('neuron_node_id');
    expect(updateCall[1]).toEqual(['kept-id', 'removed-id']);
  });

  it('handles duplicates by deleting remaining refs', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE - 1 transferred
      .mockResolvedValueOnce({ rowCount: 1 }); // DELETE - 1 duplicate removed

    const count = await transferCrossRefs('removed-id', 'kept-id', 'neuron');
    expect(count).toBe(1);

    // Verify DELETE query
    const deleteCall = mockQuery.mock.calls[1];
    expect(deleteCall[0]).toContain('DELETE FROM cross_refs');
    expect(deleteCall[1]).toEqual(['removed-id']);
  });

  it('returns 0 if no cross-refs exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 0 }) // UPDATE
      .mockResolvedValueOnce({ rowCount: 0 }); // DELETE

    const count = await transferCrossRefs('removed-id', 'kept-id', 'neuron');
    expect(count).toBe(0);
  });

  it('works with aurora side', async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });

    await transferCrossRefs('removed-id', 'kept-id', 'aurora');
    const updateCall = mockQuery.mock.calls[0];
    expect(updateCall[0]).toContain('aurora_node_id');
  });
});

describe('checkCrossRefIntegrity', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('finds cross-refs with low Neuron confidence', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          neuron_node_id: 'n1',
          aurora_node_id: 'a1',
          relationship: 'enriches',
          neuron_title: 'Old Pattern',
          neuron_confidence: 0.3,
          aurora_title: 'Research Doc',
        },
      ],
    });

    const issues = await checkCrossRefIntegrity({ confidenceThreshold: 0.5 });
    expect(issues).toHaveLength(1);
    expect(issues[0].neuronTitle).toBe('Old Pattern');
    expect(issues[0].neuronConfidence).toBe(0.3);
    expect(issues[0].auroraTitle).toBe('Research Doc');
    expect(issues[0].issue).toBe('low_confidence');
  });

  it('returns empty list if all above threshold', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const issues = await checkCrossRefIntegrity({ confidenceThreshold: 0.5 });
    expect(issues).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await checkCrossRefIntegrity({ limit: 5 });
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1]).toContain(5); // limit param
  });

  it('uses default threshold of 0.5', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await checkCrossRefIntegrity();
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1][0]).toBe(0.5); // threshold param
  });
});

describe('createCrossRef with context and strength', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('saves context and strength', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          neuron_node_id: 'n1',
          aurora_node_id: 'a1',
          relationship: 'enriches',
          similarity: 0.8,
          metadata: {},
          context: 'auto-ingest',
          strength: 0.8,
          created_at: new Date(),
        },
      ],
    });

    const result = await createCrossRef(
      'n1', 'a1', 'enriches', 0.8,
      { source: 'test' },
      'auto-ingest',
      0.8,
    );
    expect(result.context).toBe('auto-ingest');
    expect(result.strength).toBe(0.8);

    // Verify query includes context and strength
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[0]).toContain('context');
    expect(queryCall[0]).toContain('strength');
    expect(queryCall[1]).toContain('auto-ingest');
  });

  it('defaults strength to similarity when not provided', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 2,
          neuron_node_id: 'n2',
          aurora_node_id: 'a2',
          relationship: 'supports',
          similarity: 0.9,
          metadata: {},
          context: null,
          strength: 0.9,
          created_at: new Date(),
        },
      ],
    });

    await createCrossRef('n2', 'a2', 'supports', 0.9);
    const queryCall = mockQuery.mock.calls[0];
    // strength param (index 6) should be 0.9 (= similarity)
    expect(queryCall[1][6]).toBe(0.9);
  });
});
