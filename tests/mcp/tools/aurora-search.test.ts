import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSemanticSearch = vi.fn();
vi.mock('../../../src/core/semantic-search.js', () => ({
  semanticSearch: (...args: unknown[]) => mockSemanticSearch(...args),
}));

const mockLoadAuroraGraph = vi.fn();
const mockFindAuroraNodes = vi.fn();
vi.mock('../../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: () => mockLoadAuroraGraph(),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
}));

import { registerAuroraSearchTool } from '../../../src/mcp/tools/aurora-search.js';

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

describe('aurora_search MCP tool', () => {
  beforeEach(() => {
    mockSemanticSearch.mockReset();
    mockLoadAuroraGraph.mockReset();
    mockFindAuroraNodes.mockReset();
    registerAuroraSearchTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_search',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns semantic results when available', async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Test Doc',
        type: 'document',
        similarity: 0.95,
        confidence: 0.8,
        scope: 'personal',
      },
    ]);

    const result = await toolHandler({ query: 'test', limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('doc-1');
    expect(data[0].similarity).toBe(0.95);
    expect(data[0].properties).toEqual({});
    expect(mockSemanticSearch).toHaveBeenCalledWith('test', {
      table: 'aurora_nodes',
      type: undefined,
      scope: undefined,
      limit: 10,
    });
  });

  it('filters by type and scope', async () => {
    mockSemanticSearch.mockResolvedValue([
      {
        id: 'f-1',
        title: 'A Fact',
        type: 'fact',
        similarity: 0.9,
        confidence: 0.7,
        scope: 'shared',
      },
    ]);

    const result = await toolHandler({
      query: 'test',
      type: 'fact',
      scope: 'shared',
      limit: 5,
    });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveLength(1);
    expect(data[0].type).toBe('fact');
    expect(mockSemanticSearch).toHaveBeenCalledWith('test', {
      table: 'aurora_nodes',
      type: 'fact',
      scope: 'shared',
      limit: 5,
    });
  });

  it('falls back to keyword search on semantic error', async () => {
    mockSemanticSearch.mockRejectedValue(new Error('No Postgres'));

    const keywordNode = {
      id: 'doc-1',
      type: 'document',
      title: 'Keyword Doc',
      properties: { desc: 'found' },
      confidence: 0.8,
      scope: 'personal',
      created: '2024-01-01',
      updated: '2024-01-01',
    };
    mockLoadAuroraGraph.mockResolvedValue({
      nodes: [keywordNode],
      edges: [],
      lastUpdated: '2024-01-01',
    });
    mockFindAuroraNodes.mockReturnValue([keywordNode]);

    const result = await toolHandler({ query: 'keyword', limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveLength(1);
    expect(data[0].similarity).toBeNull();
    expect(data[0].properties).toEqual({ desc: 'found' });
    expect(result.isError).not.toBe(true);
  });

  it('handles empty results', async () => {
    mockSemanticSearch.mockResolvedValue([]);

    const result = await toolHandler({ query: 'nonexistent', limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual([]);
  });

  it('returns error on complete failure', async () => {
    mockSemanticSearch.mockRejectedValue(new Error('No Postgres'));
    mockLoadAuroraGraph.mockRejectedValue(new Error('File not found'));

    const result = await toolHandler({ query: 'broken', limit: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error:');
  });
});
