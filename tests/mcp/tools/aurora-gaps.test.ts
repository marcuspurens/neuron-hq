import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetGaps = vi.fn();
vi.mock('../../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: (...args: unknown[]) => mockGetGaps(...args),
}));

import { registerAuroraGapsTool } from '../../../src/mcp/tools/aurora-gaps.js';

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

describe('aurora_gaps MCP tool', () => {
  beforeEach(() => {
    mockGetGaps.mockReset();
    registerAuroraGapsTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_gaps',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns GapsResult as JSON', async () => {
    mockGetGaps.mockResolvedValue({
      gaps: [
        { question: 'What is quantum physics?', askedAt: '2026-03-09T12:00:00.000Z', frequency: 3 },
      ],
      totalUnanswered: 1,
    });

    const result = await toolHandler({ limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data.gaps).toHaveLength(1);
    expect(data.gaps[0].question).toBe('What is quantum physics?');
    expect(data.totalUnanswered).toBe(1);
    expect(result.isError).not.toBe(true);
  });

  it('handles empty result', async () => {
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });

    const result = await toolHandler({ limit: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data.gaps).toEqual([]);
    expect(data.totalUnanswered).toBe(0);
    expect(result.isError).not.toBe(true);
  });

  it('passes limit parameter', async () => {
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });

    await toolHandler({ limit: 5 });

    expect(mockGetGaps).toHaveBeenCalledWith(5);
  });

  it('returns error on failure', async () => {
    mockGetGaps.mockRejectedValue(new Error('DB unavailable'));

    const result = await toolHandler({ limit: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB unavailable');
  });
});
