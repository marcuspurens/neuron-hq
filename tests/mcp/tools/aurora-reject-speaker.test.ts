import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRejectSpeakerSuggestion = vi.fn();
vi.mock('../../../src/aurora/speaker-identity.js', () => ({
  rejectSpeakerSuggestion: (...args: unknown[]) => mockRejectSpeakerSuggestion(...args),
}));

vi.mock('../../../src/core/db.js', () => ({
  getPool: vi.fn(), isDbAvailable: vi.fn().mockResolvedValue(false), closePool: vi.fn(),
}));
vi.mock('../../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false), getEmbeddingProvider: vi.fn(),
}));

import { registerAuroraRejectSpeakerTool } from '../../../src/mcp/tools/aurora-reject-speaker.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
const toolHandlers: Record<string, ToolHandler> = {};
const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: ToolHandler) => { toolHandlers[name] = handler; }),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('aurora_reject_speaker MCP tool', () => {
  beforeEach(() => {
    mockRejectSpeakerSuggestion.mockReset();
    mockServer.tool.mockClear();
    registerAuroraRejectSpeakerTool(mockServer);
  });

  it('registers the tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith('aurora_reject_speaker', expect.any(String), expect.any(Object), expect.any(Function));
  });

  it('rejects suggestion and returns result', async () => {
    mockRejectSpeakerSuggestion.mockResolvedValue(undefined);
    const result = await toolHandlers['aurora_reject_speaker']({ identityId: 'speaker-marcus', voicePrintId: 'vp-1' });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.rejected).toBe(true);
  });

  it('returns error on failure', async () => {
    mockRejectSpeakerSuggestion.mockRejectedValue(new Error('Not found'));
    const result = await toolHandlers['aurora_reject_speaker']({ identityId: 'bad-id', voicePrintId: 'vp-1' });
    expect(result.isError).toBe(true);
  });
});
