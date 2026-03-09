import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSearchAurora = vi.fn();
vi.mock('../../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
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
    mockSearchAurora.mockReset();
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

  it('returns search results with all fields mapped', async () => {
    mockSearchAurora.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Test Doc',
        type: 'document',
        similarity: 0.95,
        confidence: 0.8,
        scope: 'personal',
        text: 'Some content',
        source: 'semantic',
        related: [{ id: 'doc-2', title: 'Related', edgeType: 'references' }],
      },
    ]);

    const result = await toolHandler({ query: 'test', limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('doc-1');
    expect(data[0].similarity).toBe(0.95);
    expect(data[0].text).toBe('Some content');
    expect(data[0].source).toBe('semantic');
    expect(data[0].related).toEqual([
      { id: 'doc-2', title: 'Related', edgeType: 'references' },
    ]);
  });

  it('passes type, scope, and limit to searchAurora', async () => {
    mockSearchAurora.mockResolvedValue([]);

    await toolHandler({
      query: 'test',
      type: 'fact',
      scope: 'shared',
      limit: 5,
    });

    expect(mockSearchAurora).toHaveBeenCalledWith('test', {
      type: 'fact',
      scope: 'shared',
      limit: 5,
      includeRelated: true,
    });
  });

  it('defaults related to empty array when undefined', async () => {
    mockSearchAurora.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'No Related',
        type: 'document',
        similarity: 0.8,
        confidence: 0.7,
        scope: 'personal',
        source: 'semantic',
      },
    ]);

    const result = await toolHandler({ query: 'test', limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data[0].related).toEqual([]);
  });

  it('handles empty results', async () => {
    mockSearchAurora.mockResolvedValue([]);

    const result = await toolHandler({ query: 'nonexistent', limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual([]);
  });

  it('returns error on failure', async () => {
    mockSearchAurora.mockRejectedValue(new Error('Search failed'));

    const result = await toolHandler({ query: 'broken', limit: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Search failed');
  });
});
