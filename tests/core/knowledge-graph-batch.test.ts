import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module before importing the module under test
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};
const mockPoolConnect = vi.fn().mockResolvedValue(mockClient);
const mockPoolQuery = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getPool: () => ({ connect: mockPoolConnect, query: mockPoolQuery }),
  isDbAvailable: () => Promise.resolve(true),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: () => Promise.resolve(false),
  getEmbeddingProvider: () => null,
}));

import { saveGraphToDb, type KnowledgeGraph } from '../../src/core/knowledge-graph.js';

describe('saveGraphToDb batch operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolConnect.mockResolvedValue(mockClient);
    // Default: return empty rows for SELECT queries
    mockClientQuery.mockResolvedValue({ rows: [] });
  });

  /** Helper to build a minimal valid graph. */
  function makeGraph(overrides: Partial<KnowledgeGraph> = {}): KnowledgeGraph {
    return {
      version: '1.0.0',
      nodes: [],
      edges: [],
      lastUpdated: new Date().toISOString(),
      ...overrides,
    };
  }

  /** Find calls matching a SQL pattern. */
  function findQueries(pattern: string): Array<{ sql: string; params: unknown[] }> {
    return mockClientQuery.mock.calls
      .filter((call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes(pattern))
      .map((call: unknown[]) => ({ sql: call[0] as string, params: (call[1] ?? []) as unknown[] }));
  }

  it('batch deletes edges using UNNEST when stale edges exist', async () => {
    // Simulate DB has edges that are NOT in the graph
    mockClientQuery.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT from_id, to_id, type FROM kg_edges')) {
        return {
          rows: [
            { from_id: 'a', to_id: 'b', type: 'solves' },
            { from_id: 'c', to_id: 'd', type: 'causes' },
          ],
        };
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM kg_nodes')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const graph = makeGraph(); // no edges => all DB edges are stale
    await saveGraphToDb(graph);

    const deleteEdgeCalls = findQueries('DELETE FROM kg_edges');
    expect(deleteEdgeCalls).toHaveLength(1);
    expect(deleteEdgeCalls[0].sql).toContain('unnest');
    expect(deleteEdgeCalls[0].params).toEqual([
      ['a', 'c'],
      ['b', 'd'],
      ['solves', 'causes'],
    ]);
  });

  it('batch upserts edges using UNNEST when graph has edges', async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT from_id, to_id, type FROM kg_edges')) {
        return { rows: [] };
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM kg_nodes')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const graph = makeGraph({
      edges: [
        { from: 'n1', to: 'n2', type: 'solves', metadata: { runId: 'r1' } },
        { from: 'n3', to: 'n4', type: 'causes', metadata: {} },
      ],
    });
    await saveGraphToDb(graph);

    const upsertCalls = findQueries('INSERT INTO kg_edges');
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].sql).toContain('unnest');
    expect(upsertCalls[0].params).toEqual([
      ['n1', 'n3'],
      ['n2', 'n4'],
      ['solves', 'causes'],
      [JSON.stringify({ runId: 'r1' }), JSON.stringify({})],
    ]);
  });

  it('batch deletes nodes using ANY when stale nodes exist', async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT from_id, to_id, type FROM kg_edges')) {
        return { rows: [] };
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM kg_nodes')) {
        return { rows: [{ id: 'old-node-1' }, { id: 'old-node-2' }] };
      }
      return { rows: [] };
    });

    const graph = makeGraph(); // no nodes => all DB nodes are stale
    await saveGraphToDb(graph);

    const deleteNodeCalls = findQueries('DELETE FROM kg_nodes');
    expect(deleteNodeCalls).toHaveLength(1);
    expect(deleteNodeCalls[0].sql).toContain('ANY');
    expect(deleteNodeCalls[0].params).toEqual([['old-node-1', 'old-node-2']]);
  });

  it('skips DELETE queries when there is nothing to delete', async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT from_id, to_id, type FROM kg_edges')) {
        return { rows: [] }; // no existing edges
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM kg_nodes')) {
        return { rows: [] }; // no existing nodes
      }
      return { rows: [] };
    });

    const graph = makeGraph(); // empty graph, empty DB
    await saveGraphToDb(graph);

    const deleteEdgeCalls = findQueries('DELETE FROM kg_edges');
    expect(deleteEdgeCalls).toHaveLength(0);

    const deleteNodeCalls = findQueries('DELETE FROM kg_nodes');
    expect(deleteNodeCalls).toHaveLength(0);
  });

  it('skips edge upsert when graph has no edges', async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    const graph = makeGraph(); // no edges
    await saveGraphToDb(graph);

    const upsertEdgeCalls = findQueries('INSERT INTO kg_edges');
    expect(upsertEdgeCalls).toHaveLength(0);
  });

  it('wraps everything in BEGIN/COMMIT', async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    await saveGraphToDb(makeGraph());

    const allSqls = mockClientQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(allSqls[0]).toBe('BEGIN');
    expect(allSqls[allSqls.length - 1]).toBe('COMMIT');
  });

  it('rolls back on error', async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT from_id')) {
        throw new Error('DB failure');
      }
      return { rows: [] };
    });

    await expect(saveGraphToDb(makeGraph())).rejects.toThrow('DB failure');

    const allSqls = mockClientQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(allSqls).toContain('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
  });
});
