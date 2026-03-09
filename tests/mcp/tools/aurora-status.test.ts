import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockIsDbAvailable = vi.fn();

vi.mock('../../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
  isDbAvailable: () => mockIsDbAvailable(),
}));

import { registerAuroraStatusTool } from '../../../src/mcp/tools/aurora-status.js';

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

describe('aurora_status MCP tool', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIsDbAvailable.mockReset();
    registerAuroraStatusTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_status',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns zero counts when DB unavailable', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.totalNodes).toBe(0);
    expect(data.totalEdges).toBe(0);
    expect(data.embeddingCoverage.total).toBe(0);
    expect(data.latestNode).toBeNull();
  });

  it('returns correct stats from DB', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ type: 'document', count: 3 }, { type: 'fact', count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ type: 'related_to', count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ with_embedding: 2, total: 5 }] })
      .mockResolvedValueOnce({ rows: [{ title: 'Test Doc', created: '2026-03-01T00:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [{ stale: 0, active: 4 }] });

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.totalNodes).toBe(5);
    expect(data.totalEdges).toBe(1);
    expect(data.nodesByType).toEqual({ document: 3, fact: 2 });
    expect(data.edgesByType).toEqual({ related_to: 1 });
    expect(data.embeddingCoverage).toEqual({ withEmbedding: 2, total: 5 });
    expect(data.latestNode).toEqual({ title: 'Test Doc', created: '2026-03-01T00:00:00Z' });
    expect(data.confidenceDistribution).toEqual({ stale: 0, active: 4 });
  });

  it('handles empty DB gracefully', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ with_embedding: 0, total: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ stale: 0, active: 0 }] });

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.totalNodes).toBe(0);
    expect(data.totalEdges).toBe(0);
    expect(data.latestNode).toBeNull();
  });

  it('returns error when DB query fails', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await toolHandler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Connection timeout');
  });
});
