import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSuggestSpeakerMatches = vi.fn();
vi.mock('../../../src/aurora/voiceprint.js', () => ({
  suggestSpeakerMatches: (...args: unknown[]) =>
    mockSuggestSpeakerMatches(...args),
}));

vi.mock('../../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

vi.mock('../../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

import { registerAuroraSuggestSpeakersTool } from '../../../src/mcp/tools/aurora-suggest-speakers.js';

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

const toolHandlers: Record<string, ToolHandler> = {};
const mockServer = {
  tool: vi.fn(
    (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      toolHandlers[name] = handler;
    },
  ),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('aurora_suggest_speakers MCP tool', () => {
  beforeEach(() => {
    mockSuggestSpeakerMatches.mockReset();
    mockServer.tool.mockClear();
    registerAuroraSuggestSpeakersTool(mockServer);
  });

  it('returns matches above threshold', async () => {
    const matches = [
      {
        sourceId: 'vp-1',
        sourceName: 'Speaker: Marcus',
        matchId: 'vp-3',
        matchName: 'Speaker: Marcus',
        sourceVideo: 'video-a',
        matchVideo: 'video-b',
        similarity: 0.95,
        reason: 'Same name: Marcus',
      },
    ];
    mockSuggestSpeakerMatches.mockResolvedValue(matches);

    const result = await toolHandlers['aurora_suggest_speakers']({
      threshold: 0.7,
    });

    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].sourceId).toBe('vp-1');
    expect(data[0].similarity).toBe(0.95);
  });

  it('returns empty when no matches', async () => {
    mockSuggestSpeakerMatches.mockResolvedValue([]);

    const result = await toolHandlers['aurora_suggest_speakers']({
      threshold: 0.7,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('No matches');
  });

  it('filters by voicePrintId when provided', async () => {
    mockSuggestSpeakerMatches.mockResolvedValue([]);

    await toolHandlers['aurora_suggest_speakers']({
      voicePrintId: 'vp-42',
      threshold: 0.8,
    });

    expect(mockSuggestSpeakerMatches).toHaveBeenCalledWith({
      voicePrintId: 'vp-42',
      threshold: 0.8,
    });
  });
});
