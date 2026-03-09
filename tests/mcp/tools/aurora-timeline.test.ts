import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTimeline = vi.fn();
vi.mock('../../../src/aurora/timeline.js', () => ({
  timeline: (...args: unknown[]) => mockTimeline(...args),
}));

import { registerAuroraTimelineTool } from '../../../src/mcp/tools/aurora-timeline.js';

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

describe('aurora_timeline MCP tool', () => {
  beforeEach(() => {
    mockTimeline.mockReset();
    registerAuroraTimelineTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_timeline',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns TimelineEntry[] as JSON', async () => {
    mockTimeline.mockResolvedValue([
      {
        id: 'n1',
        title: 'Test fact',
        type: 'fact',
        createdAt: '2026-03-09T12:00:00.000Z',
        scope: 'personal',
        confidence: 0.9,
      },
    ]);

    const result = await toolHandler({ limit: 20 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveLength(1);
    expect(data[0].title).toBe('Test fact');
    expect(data[0].type).toBe('fact');
    expect(result.isError).not.toBe(true);
  });

  it('handles empty result', async () => {
    mockTimeline.mockResolvedValue([]);

    const result = await toolHandler({ limit: 20 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toEqual([]);
    expect(result.isError).not.toBe(true);
  });

  it('passes parameters correctly', async () => {
    mockTimeline.mockResolvedValue([]);

    await toolHandler({ limit: 5, type: 'fact', scope: 'shared', since: '2026-03-01' });

    expect(mockTimeline).toHaveBeenCalledWith({
      limit: 5,
      type: 'fact',
      scope: 'shared',
      since: '2026-03-01',
    });
  });

  it('returns error on failure', async () => {
    mockTimeline.mockRejectedValue(new Error('Graph unavailable'));

    const result = await toolHandler({ limit: 20 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Graph unavailable');
  });
});
