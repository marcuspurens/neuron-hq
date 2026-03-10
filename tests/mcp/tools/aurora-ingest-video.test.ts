import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIngestVideo = vi.fn();
vi.mock('../../../src/aurora/video.js', () => ({
  ingestVideo: (...args: unknown[]) => mockIngestVideo(...args),
}));

import { registerAuroraIngestVideoTool } from '../../../src/mcp/tools/aurora-ingest-video.js';

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

describe('aurora_ingest_video MCP tool', () => {
  beforeEach(() => {
    mockIngestVideo.mockReset();
    mockServer.tool.mockClear();
    registerAuroraIngestVideoTool(mockServer);
  });

  it('registers tool with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(1);
    expect(toolHandlers).toHaveProperty('aurora_ingest_video');
  });

  it('returns VideoIngestResult on success', async () => {
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
      platform: 'youtube',
    });

    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
      diarize: false,
      scope: 'personal',
      whisper_model: 'small',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.transcriptNodeId).toBe('yt-abc123');
    expect(data.title).toBe('Test Video');
    expect(result.isError).not.toBe(true);
  });

  it('handles ingest errors', async () => {
    mockIngestVideo.mockRejectedValue(new Error('download failed'));
    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('download failed');
  });

  it('passes all options to ingestVideo', async () => {
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 2,
      title: 'Test',
      duration: 60,
      videoId: 'abc123',
      platform: 'youtube',
    });
    await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
      diarize: true,
      scope: 'shared',
      whisper_model: 'large',
    });
    expect(mockIngestVideo).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining({
        diarize: true,
        scope: 'shared',
        whisperModel: 'large',
      }),
    );
  });

  it('accepts non-YouTube URLs', async () => {
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'vid-abc123456789',
      chunksCreated: 3,
      voicePrintsCreated: 0,
      title: 'SVT Video',
      duration: 180,
      videoId: null,
      platform: 'svtplay',
    });

    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.svt.se/nyheter/test',
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.transcriptNodeId).toMatch(/^vid-/);
    expect(data.platform).toBe('svtplay');
    expect(result.isError).not.toBe(true);
  });

  it('passes language option to ingestVideo', async () => {
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
      platform: 'youtube',
    });

    await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
      language: 'sv',
    });

    expect(mockIngestVideo).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining({ language: 'sv' }),
    );
  });
});
