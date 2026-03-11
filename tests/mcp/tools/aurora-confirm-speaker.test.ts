import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateSpeakerIdentity = vi.fn();
const mockConfirmSpeaker = vi.fn();
const mockListSpeakerIdentities = vi.fn();
vi.mock('../../../src/aurora/speaker-identity.js', () => ({
  createSpeakerIdentity: (...args: unknown[]) => mockCreateSpeakerIdentity(...args),
  confirmSpeaker: (...args: unknown[]) => mockConfirmSpeaker(...args),
  listSpeakerIdentities: (...args: unknown[]) => mockListSpeakerIdentities(...args),
}));

vi.mock('../../../src/core/db.js', () => ({
  getPool: vi.fn(), isDbAvailable: vi.fn().mockResolvedValue(false), closePool: vi.fn(),
}));
vi.mock('../../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false), getEmbeddingProvider: vi.fn(),
}));

import { registerAuroraConfirmSpeakerTool } from '../../../src/mcp/tools/aurora-confirm-speaker.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
const toolHandlers: Record<string, ToolHandler> = {};
const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: ToolHandler) => { toolHandlers[name] = handler; }),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('aurora_confirm_speaker MCP tool', () => {
  beforeEach(() => {
    mockCreateSpeakerIdentity.mockReset();
    mockConfirmSpeaker.mockReset();
    mockListSpeakerIdentities.mockReset();
    mockServer.tool.mockClear();
    registerAuroraConfirmSpeakerTool(mockServer);
  });

  it('registers the tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith('aurora_confirm_speaker', expect.any(String), expect.any(Object), expect.any(Function));
  });

  it('confirms existing identity', async () => {
    mockListSpeakerIdentities.mockResolvedValue([{ id: 'speaker-marcus', name: 'Marcus', confidence: 0.6 }]);
    mockConfirmSpeaker.mockResolvedValue({ identity: { id: 'speaker-marcus', name: 'Marcus', confidence: 0.7, confirmations: 3 }, newConfidence: 0.7 });
    const result = await toolHandlers['aurora_confirm_speaker']({ voicePrintId: 'vp-1', identityName: 'Marcus' });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.newConfidence).toBe(0.7);
  });

  it('returns error on failure', async () => {
    mockListSpeakerIdentities.mockRejectedValue(new Error('DB error'));
    const result = await toolHandlers['aurora_confirm_speaker']({ voicePrintId: 'vp-1', identityName: 'Marcus' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });
});
