import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIngestYouTube = vi.fn();
const mockIsYouTubeUrl = vi.fn();
vi.mock('../../../src/aurora/youtube.js', () => ({
  ingestYouTube: (...args: unknown[]) => mockIngestYouTube(...args),
  isYouTubeUrl: (...args: unknown[]) => mockIsYouTubeUrl(...args),
}));

import { registerAuroraIngestYouTubeTool } from '../../../src/mcp/tools/aurora-ingest-youtube.js';

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

describe('aurora_ingest_youtube MCP tool', () => {
  beforeEach(() => {
    mockIngestYouTube.mockReset();
    mockIsYouTubeUrl.mockReset();
    mockServer.tool.mockClear();
    registerAuroraIngestYouTubeTool(mockServer);
  });

  it('registers tool with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(1);
    expect(toolHandlers).toHaveProperty('aurora_ingest_youtube');
  });

  it('returns YouTubeIngestResult on success', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIngestYouTube.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
    });

    const result = await toolHandlers['aurora_ingest_youtube']({
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

  it('returns error for non-YouTube URL', async () => {
    mockIsYouTubeUrl.mockReturnValue(false);
    const result = await toolHandlers['aurora_ingest_youtube']({
      url: 'https://example.com',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not a valid YouTube URL');
  });

  it('handles ingest errors', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIngestYouTube.mockRejectedValue(new Error('download failed'));
    const result = await toolHandlers['aurora_ingest_youtube']({
      url: 'https://www.youtube.com/watch?v=abc123',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('download failed');
  });

  it('passes all options to ingestYouTube', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIngestYouTube.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 2,
      title: 'Test',
      duration: 60,
      videoId: 'abc123',
    });
    await toolHandlers['aurora_ingest_youtube']({
      url: 'https://www.youtube.com/watch?v=abc123',
      diarize: true,
      scope: 'shared',
      whisper_model: 'large',
    });
    expect(mockIngestYouTube).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining({
        diarize: true,
        scope: 'shared',
        whisperModel: 'large',
      }),
    );
  });
});
