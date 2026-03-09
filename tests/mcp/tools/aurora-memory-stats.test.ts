import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMemoryStats = vi.fn();
vi.mock('../../../src/aurora/memory.js', () => ({
  memoryStats: (...args: unknown[]) => mockMemoryStats(...args),
}));

import { registerAuroraMemoryStatsTool } from '../../../src/mcp/tools/aurora-memory-stats.js';

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

describe('aurora_memory_stats MCP tool', () => {
  beforeEach(() => {
    mockMemoryStats.mockReset();
    registerAuroraMemoryStatsTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_memory_stats',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns MemoryStats as JSON', async () => {
    mockMemoryStats.mockResolvedValue({
      facts: 10,
      preferences: 3,
      total: 13,
      avgConfidence: 0.75,
      byScope: { personal: 8, shared: 5 },
    });

    const result = await toolHandler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.facts).toBe(10);
    expect(data.preferences).toBe(3);
    expect(data.total).toBe(13);
    expect(data.avgConfidence).toBe(0.75);
    expect(data.byScope.personal).toBe(8);
    expect(result.isError).not.toBe(true);
  });

  it('returns error on failure', async () => {
    mockMemoryStats.mockRejectedValue(new Error('DB error'));

    const result = await toolHandler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: DB error');
  });
});
