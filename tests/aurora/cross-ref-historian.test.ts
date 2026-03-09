import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockFindAuroraMatchesForNeuron = vi.fn();
const mockCreateCrossRef = vi.fn();

vi.mock('../../src/aurora/cross-ref.js', () => ({
  findAuroraMatchesForNeuron: (...args: unknown[]) => mockFindAuroraMatchesForNeuron(...args),
  createCrossRef: (...args: unknown[]) => mockCreateCrossRef(...args),
}));

vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(true),
  getEmbeddingProvider: vi.fn(),
}));

vi.mock('../../src/core/knowledge-graph.js', () => ({
  loadGraph: vi.fn().mockResolvedValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
  saveGraph: vi.fn(),
  findNodes: vi.fn().mockReturnValue([]),
  traverse: vi.fn().mockReturnValue([]),
  addNode: vi.fn().mockReturnValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
  addEdge: vi.fn().mockReturnValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
  updateNode: vi.fn().mockReturnValue({ version: '1.0.0', nodes: [], edges: [], lastUpdated: '' }),
}));

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
}));

import { executeGraphTool, type GraphToolContext } from '../../src/core/agents/graph-tools.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const mockAudit = { log: vi.fn().mockResolvedValue(undefined) };
const ctx: GraphToolContext = {
  graphPath: '/tmp/test-graph.json',
  runId: 'test-run',
  agent: 'historian',
  model: 'test-model',
  audit: mockAudit,
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('graph_cross_ref tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Aurora matches for a Neuron node', async () => {
    mockFindAuroraMatchesForNeuron.mockResolvedValue([
      {
        node: { id: 'doc-1', title: 'Research Doc', type: 'document', confidence: 1.0 },
        source: 'aurora',
        similarity: 0.88,
      },
      {
        node: { id: 'fact-1', title: 'Known Fact', type: 'fact', confidence: 0.9 },
        source: 'aurora',
        similarity: 0.55,
      },
    ]);
    mockCreateCrossRef.mockResolvedValue({ id: 1 });

    const resultStr = await executeGraphTool('graph_cross_ref', {
      neuron_node_id: 'pattern-001',
    }, ctx);
    const result = JSON.parse(resultStr);

    expect(result.neuronNodeId).toBe('pattern-001');
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].auroraNodeId).toBe('doc-1');
    expect(result.matches[0].similarity).toBe(0.88);
    expect(result.matches[0].crossRefCreated).toBe(true);
    expect(result.matches[1].auroraNodeId).toBe('fact-1');
    expect(result.matches[1].crossRefCreated).toBe(false); // 0.55 < 0.7
  });

  it('creates cross-refs for matches with similarity >= 0.7', async () => {
    mockFindAuroraMatchesForNeuron.mockResolvedValue([
      {
        node: { id: 'doc-1', title: 'Doc', type: 'document', confidence: 1.0 },
        source: 'aurora',
        similarity: 0.85,
      },
      {
        node: { id: 'doc-2', title: 'Doc2', type: 'document', confidence: 0.9 },
        source: 'aurora',
        similarity: 0.72,
      },
      {
        node: { id: 'fact-1', title: 'Fact', type: 'fact', confidence: 0.7 },
        source: 'aurora',
        similarity: 0.55,
      },
    ]);
    mockCreateCrossRef.mockResolvedValue({ id: 1 });

    const resultStr = await executeGraphTool('graph_cross_ref', {
      neuron_node_id: 'pattern-001',
    }, ctx);
    const result = JSON.parse(resultStr);

    // Only 2 cross-refs created (similarity >= 0.7)
    expect(mockCreateCrossRef).toHaveBeenCalledTimes(2);
    expect(result.crossRefsCreated).toHaveLength(2);
    expect(result.crossRefsCreated[0].auroraNodeId).toBe('doc-1');
    expect(result.crossRefsCreated[1].auroraNodeId).toBe('doc-2');
  });

  it('returns empty results when no matches found', async () => {
    mockFindAuroraMatchesForNeuron.mockResolvedValue([]);

    const resultStr = await executeGraphTool('graph_cross_ref', {
      neuron_node_id: 'pattern-999',
    }, ctx);
    const result = JSON.parse(resultStr);

    expect(result.matches).toHaveLength(0);
    expect(result.crossRefsCreated).toHaveLength(0);
    expect(mockCreateCrossRef).not.toHaveBeenCalled();
  });

  it('uses custom relationship', async () => {
    mockFindAuroraMatchesForNeuron.mockResolvedValue([
      {
        node: { id: 'doc-1', title: 'Doc', type: 'document', confidence: 1.0 },
        source: 'aurora',
        similarity: 0.9,
      },
    ]);
    mockCreateCrossRef.mockResolvedValue({ id: 1 });

    await executeGraphTool('graph_cross_ref', {
      neuron_node_id: 'pattern-001',
      relationship: 'supports',
    }, ctx);

    expect(mockCreateCrossRef).toHaveBeenCalledWith(
      'pattern-001',
      'doc-1',
      'supports',
      0.9,
      expect.objectContaining({ createdBy: 'historian', runId: 'test-run' }),
      'historian-discovery',
    );
  });

  it('handles errors gracefully', async () => {
    mockFindAuroraMatchesForNeuron.mockRejectedValue(new Error('DB connection failed'));

    const resultStr = await executeGraphTool('graph_cross_ref', {
      neuron_node_id: 'pattern-001',
    }, ctx);
    const result = JSON.parse(resultStr);

    expect(result.matches).toHaveLength(0);
    expect(result.crossRefsCreated).toHaveLength(0);
    expect(result.error).toContain('DB connection failed');
  });

  it('defaults to enriches relationship', async () => {
    mockFindAuroraMatchesForNeuron.mockResolvedValue([
      {
        node: { id: 'doc-1', title: 'Doc', type: 'document', confidence: 1.0 },
        source: 'aurora',
        similarity: 0.8,
      },
    ]);
    mockCreateCrossRef.mockResolvedValue({ id: 1 });

    await executeGraphTool('graph_cross_ref', {
      neuron_node_id: 'pattern-001',
    }, ctx);

    expect(mockCreateCrossRef).toHaveBeenCalledWith(
      'pattern-001',
      'doc-1',
      'enriches',
      0.8,
      expect.any(Object),
      'historian-discovery',
    );
  });

  it('logs audit entry', async () => {
    mockFindAuroraMatchesForNeuron.mockResolvedValue([]);

    await executeGraphTool('graph_cross_ref', {
      neuron_node_id: 'pattern-001',
    }, ctx);

    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'graph_cross_ref',
      allowed: true,
    }));
  });
});
