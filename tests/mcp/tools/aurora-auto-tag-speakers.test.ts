import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAutoTagSpeakers = vi.fn();
vi.mock('../../../src/aurora/speaker-identity.js', () => ({
  autoTagSpeakers: (...args: unknown[]) => mockAutoTagSpeakers(...args),
}));

vi.mock('../../../src/core/db.js', () => ({
  getPool: vi.fn(), isDbAvailable: vi.fn().mockResolvedValue(false), closePool: vi.fn(),
}));
vi.mock('../../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false), getEmbeddingProvider: vi.fn(),
}));

import { registerAuroraAutoTagSpeakersTool } from '../../../src/mcp/tools/aurora-auto-tag-speakers.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
const toolHandlers: Record<string, ToolHandler> = {};
const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: ToolHandler) => { toolHandlers[name] = handler; }),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('aurora_auto_tag_speakers MCP tool', () => {
  beforeEach(() => {
    mockAutoTagSpeakers.mockReset();
    mockServer.tool.mockClear();
    registerAuroraAutoTagSpeakersTool(mockServer);
  });

  it('registers the tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith('aurora_auto_tag_speakers', expect.any(String), expect.any(Object), expect.any(Function));
  });

  it('returns auto-tag results', async () => {
    mockAutoTagSpeakers.mockResolvedValue([{ voicePrintId: 'vp-1', identityId: 'speaker-marcus', identityName: 'Marcus', confidence: 0.9, action: 'auto_tagged' }]);
    const result = await toolHandlers['aurora_auto_tag_speakers']({ voicePrintIds: ['vp-1'] });
    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data[0].action).toBe('auto_tagged');
  });

  it('returns error on failure', async () => {
    mockAutoTagSpeakers.mockRejectedValue(new Error('Graph error'));
    const result = await toolHandlers['aurora_auto_tag_speakers']({ voicePrintIds: ['vp-1'] });
    expect(result.isError).toBe(true);
  });
});
