import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadGraph = vi.fn();
const mockFindNodes = vi.fn();
const mockTraverse = vi.fn();
vi.mock('../../../src/core/knowledge-graph.js', () => ({
  loadGraph: () => mockLoadGraph(),
  findNodes: (...args: unknown[]) => mockFindNodes(...args),
  traverse: (...args: unknown[]) => mockTraverse(...args),
}));

import { registerKnowledgeTool } from '../../../src/mcp/tools/knowledge.js';

const sampleGraph = {
  version: '2.0',
  nodes: [
    {
      id: 'p-1',
      type: 'pattern',
      title: 'Test Pattern',
      properties: { desc: 'testing' },
      confidence: 0.9,
      scope: 'universal',
      created: '2024-01-01',
      updated: '2024-01-01',
    },
    {
      id: 'e-1',
      type: 'error',
      title: 'Test Error',
      properties: { desc: 'broken' },
      confidence: 0.7,
      scope: 'project-specific',
      created: '2024-01-01',
      updated: '2024-01-01',
    },
  ],
  edges: [],
  lastUpdated: '2024-01-01',
};

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

let toolHandler: ToolHandler;
const mockServer = {
  tool: vi.fn(
    (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      toolHandler = handler;
    },
  ),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('neuron_knowledge tool', () => {
  beforeEach(() => {
    mockLoadGraph.mockReset();
    mockFindNodes.mockReset();
    mockTraverse.mockReset();
    mockLoadGraph.mockResolvedValue(sampleGraph);
    mockFindNodes.mockReturnValue([sampleGraph.nodes[0]]);
    mockTraverse.mockReturnValue([]);
    registerKnowledgeTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_knowledge',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('keyword search returns matching nodes', async () => {
    const result = await toolHandler({
      query: 'test',
      semantic: false,
      limit: 10,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].node.id).toBe('p-1');
    expect(mockFindNodes).toHaveBeenCalledWith(
      sampleGraph,
      expect.objectContaining({ query: 'test' }),
    );
  });

  it('falls back to keyword when semantic fails', async () => {
    // semantic=true is default, but semantic-search module will fail to import in tests
    const result = await toolHandler({
      query: 'test',
      semantic: true,
      limit: 10,
    });
    // Should still return results via keyword fallback
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
  });

  it('includes edges for each node', async () => {
    const relatedNode = { id: 'e-1', title: 'Test Error', type: 'error' };
    mockTraverse.mockReturnValue([relatedNode]);

    const result = await toolHandler({
      query: 'test',
      semantic: false,
      limit: 10,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data[0].edges).toHaveLength(1);
    expect(data[0].edges[0].id).toBe('e-1');
  });

  it('filters by type', async () => {
    await toolHandler({
      query: 'test',
      type: 'pattern',
      semantic: false,
      limit: 10,
    });
    expect(mockFindNodes).toHaveBeenCalledWith(
      sampleGraph,
      expect.objectContaining({ type: 'pattern' }),
    );
  });

  it('filters by scope', async () => {
    await toolHandler({
      query: 'test',
      scope: 'universal',
      semantic: false,
      limit: 10,
    });
    expect(mockFindNodes).toHaveBeenCalledWith(
      sampleGraph,
      expect.objectContaining({ scope: 'universal' }),
    );
  });

  it('respects limit', async () => {
    mockFindNodes.mockReturnValue(sampleGraph.nodes); // 2 nodes
    const result = await toolHandler({
      query: 'test',
      semantic: false,
      limit: 1,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
  });

  it('returns error on failure', async () => {
    mockLoadGraph.mockRejectedValue(new Error('Graph failed'));
    mockFindNodes.mockImplementation(() => {
      throw new Error('Graph failed');
    });

    const result = await toolHandler({
      query: 'test',
      semantic: false,
      limit: 10,
    });
    expect(result.isError).toBe(true);
  });
});
