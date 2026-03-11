import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMergeSpeakers = vi.fn();
vi.mock('../../../src/aurora/voiceprint.js', () => ({
  mergeSpeakers: (...args: unknown[]) => mockMergeSpeakers(...args),
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

import { registerAuroraMergeSpeakersTool } from '../../../src/mcp/tools/aurora-merge-speakers.js';

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

describe('aurora_merge_speakers MCP tool', () => {
  beforeEach(() => {
    mockMergeSpeakers.mockReset();
    mockServer.tool.mockClear();
    registerAuroraMergeSpeakersTool(mockServer);
  });

  it('merges speakers and returns summary', async () => {
    mockMergeSpeakers.mockResolvedValue({
      merged: true,
      targetId: 'vp-2',
      targetName: 'Marcus',
      sourceSegments: 12,
      totalSegments: 28,
    });

    const result = await toolHandlers['aurora_merge_speakers']({
      sourceId: 'vp-1',
      targetId: 'vp-2',
    });

    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.merged).toBe(true);
    expect(data.targetId).toBe('vp-2');
    expect(data.targetName).toBe('Marcus');
    expect(data.sourceSegments).toBe(12);
    expect(data.totalSegments).toBe(28);
    expect(mockMergeSpeakers).toHaveBeenCalledWith('vp-1', 'vp-2');
  });

  it('returns error for self-merge', async () => {
    mockMergeSpeakers.mockRejectedValue(
      new Error('Cannot merge a speaker with itself'),
    );

    const result = await toolHandlers['aurora_merge_speakers']({
      sourceId: 'vp-1',
      targetId: 'vp-1',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot merge a speaker with itself');
  });
});
