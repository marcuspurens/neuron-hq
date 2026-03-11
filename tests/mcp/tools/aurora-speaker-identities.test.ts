import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListSpeakerIdentities = vi.fn();
vi.mock('../../../src/aurora/speaker-identity.js', () => ({
  listSpeakerIdentities: (...args: unknown[]) => mockListSpeakerIdentities(...args),
}));

vi.mock('../../../src/core/db.js', () => ({
  getPool: vi.fn(), isDbAvailable: vi.fn().mockResolvedValue(false), closePool: vi.fn(),
}));
vi.mock('../../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false), getEmbeddingProvider: vi.fn(),
}));

import { registerAuroraSpeakerIdentitiesTool } from '../../../src/mcp/tools/aurora-speaker-identities.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
const toolHandlers: Record<string, ToolHandler> = {};
const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: ToolHandler) => { toolHandlers[name] = handler; }),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('aurora_speaker_identities MCP tool', () => {
  beforeEach(() => {
    mockListSpeakerIdentities.mockReset();
    mockServer.tool.mockClear();
    registerAuroraSpeakerIdentitiesTool(mockServer);
  });

  it('registers the tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith('aurora_speaker_identities', expect.any(String), expect.any(Object), expect.any(Function));
  });

  it('returns identities list', async () => {
    mockListSpeakerIdentities.mockResolvedValue([{ id: 'speaker-marcus', name: 'Marcus', confidence: 0.9 }]);
    const result = await toolHandlers['aurora_speaker_identities']({});
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Marcus');
  });

  it('returns error on failure', async () => {
    mockListSpeakerIdentities.mockRejectedValue(new Error('DB error'));
    const result = await toolHandlers['aurora_speaker_identities']({});
    expect(result.isError).toBe(true);
  });
});
