import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRecall = vi.fn();
vi.mock('../../../src/aurora/memory.js', () => ({
  recall: (...args: unknown[]) => mockRecall(...args),
}));

import { registerAuroraRecallTool } from '../../../src/mcp/tools/aurora-recall.js';

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

describe('aurora_recall MCP tool', () => {
  beforeEach(() => {
    mockRecall.mockReset();
    registerAuroraRecallTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_recall',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns RecallResult as JSON', async () => {
    mockRecall.mockResolvedValue({
      memories: [
        {
          id: 'mem-1',
          title: 'Test',
          type: 'fact',
          text: 'Test',
          confidence: 0.7,
          scope: 'personal',
          tags: [],
          similarity: 0.8,
          related: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      totalFound: 1,
    });

    const result = await toolHandler({ query: 'test', limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data.memories).toHaveLength(1);
    expect(data.totalFound).toBe(1);
    expect(result.isError).not.toBe(true);
  });

  it('passes limit parameter', async () => {
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });

    await toolHandler({ query: 'test', limit: 5 });

    expect(mockRecall).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('returns error on failure', async () => {
    mockRecall.mockRejectedValue(new Error('Search failed'));

    const result = await toolHandler({ query: 'broken' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Search failed');
  });
});
