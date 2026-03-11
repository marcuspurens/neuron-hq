import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRenameSpeaker = vi.fn();
vi.mock('../../../src/aurora/voiceprint.js', () => ({
  renameSpeaker: (...args: unknown[]) => mockRenameSpeaker(...args),
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

import { registerAuroraRenameSpeakerTool } from '../../../src/mcp/tools/aurora-rename-speaker.js';

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

describe('aurora_rename_speaker MCP tool', () => {
  beforeEach(() => {
    mockRenameSpeaker.mockReset();
    mockServer.tool.mockClear();
    registerAuroraRenameSpeakerTool(mockServer);
  });

  it('renames speaker and returns result', async () => {
    mockRenameSpeaker.mockResolvedValue({
      oldName: 'SPEAKER_1',
      newName: 'Marcus',
      voicePrintId: 'vp-123',
    });

    const result = await toolHandlers['aurora_rename_speaker']({
      voicePrintId: 'vp-123',
      newName: 'Marcus',
    });

    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.oldName).toBe('SPEAKER_1');
    expect(data.newName).toBe('Marcus');
    expect(data.voicePrintId).toBe('vp-123');
    expect(mockRenameSpeaker).toHaveBeenCalledWith('vp-123', 'Marcus');
  });

  it('returns error for missing voice print', async () => {
    mockRenameSpeaker.mockRejectedValue(
      new Error('Voice print not found: vp-999'),
    );

    const result = await toolHandlers['aurora_rename_speaker']({
      voicePrintId: 'vp-999',
      newName: 'Marcus',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Voice print not found');
  });
});
