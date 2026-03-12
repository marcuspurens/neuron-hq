import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetFreshnessReport = vi.fn();
vi.mock('../../../src/aurora/freshness.js', () => ({
  getFreshnessReport: (...args: unknown[]) => mockGetFreshnessReport(...args),
}));

import { registerAuroraFreshnessTool } from '../../../src/mcp/tools/aurora-freshness.js';

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

describe('aurora_freshness_report MCP tool', () => {
  beforeEach(() => {
    mockGetFreshnessReport.mockReset();
    registerAuroraFreshnessTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_freshness_report',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns freshness report as JSON', async () => {
    const report = {
      sources: [
        { id: 'src-1', title: 'Test', lastVerified: '2026-03-01', stale: false },
      ],
      staleCount: 0,
      totalCount: 1,
    };
    mockGetFreshnessReport.mockResolvedValue(report);

    const result = await toolHandler({ only_stale: false, limit: 20 });
    const data = JSON.parse(result.content[0].text);

    expect(data.sources).toHaveLength(1);
    expect(data.staleCount).toBe(0);
    expect(result.isError).not.toBe(true);
  });

  it('passes parameters correctly', async () => {
    mockGetFreshnessReport.mockResolvedValue({ sources: [], staleCount: 0, totalCount: 0 });

    await toolHandler({ only_stale: true, limit: 5 });

    expect(mockGetFreshnessReport).toHaveBeenCalledWith({
      onlyStale: true,
      limit: 5,
    });
  });

  it('returns error on failure', async () => {
    mockGetFreshnessReport.mockRejectedValue(new Error('DB unavailable'));

    const result = await toolHandler({ only_stale: false, limit: 20 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB unavailable');
  });
});
