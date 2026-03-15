import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStartVideoIngestJob = vi.fn();
vi.mock('../../../src/aurora/job-runner.js', () => ({
  startVideoIngestJob: (...args: unknown[]) => mockStartVideoIngestJob(...args),
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
    mockStartVideoIngestJob.mockReset();
    mockServer.tool.mockClear();
    registerAuroraIngestVideoTool(mockServer);
  });

  it('registers tool with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(1);
    expect(toolHandlers).toHaveProperty('aurora_ingest_video');
  });

  it('returns queued job info on success', async () => {
    mockStartVideoIngestJob.mockResolvedValue({
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'queued',
      videoTitle: 'Test Video',
      videoDurationSec: 120,
      estimatedTimeMs: 60000,
      queuePosition: null,
    });

    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
      diarize: false,
      scope: 'personal',
      whisper_model: 'small',
    });
    expect(result.content[0].text).toContain('Queued!');
    expect(result.content[0].text).toContain('Test Video');
    expect(result.content[0].text).toContain('550e8400');
    expect(result.isError).not.toBe(true);
  });

  it('handles already_ingested status', async () => {
    mockStartVideoIngestJob.mockResolvedValue({
      jobId: '',
      status: 'already_ingested',
      videoTitle: 'Old Video',
      videoDurationSec: 60,
      estimatedTimeMs: null,
      queuePosition: null,
      existingResult: { transcriptNodeId: 'yt-old123', chunksCreated: 3 },
    });

    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=old123',
    });
    expect(result.content[0].text).toContain('already ingested');
    expect(result.content[0].text).toContain('yt-old123');
  });

  it('handles duplicate status', async () => {
    mockStartVideoIngestJob.mockResolvedValue({
      jobId: 'new-id',
      status: 'duplicate',
      videoTitle: 'Duplicate Video',
      videoDurationSec: 300,
      estimatedTimeMs: null,
      queuePosition: 2,
      existingJobId: 'existing-id',
    });

    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
    });
    expect(result.content[0].text).toContain('Already queued/running');
    expect(result.content[0].text).toContain('existing-id');
  });

  it('handles errors gracefully', async () => {
    mockStartVideoIngestJob.mockRejectedValue(new Error('DB connection failed'));
    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB connection failed');
  });

  it('passes all options to startVideoIngestJob', async () => {
    mockStartVideoIngestJob.mockResolvedValue({
      jobId: 'test-id',
      status: 'queued',
      videoTitle: 'Test',
      videoDurationSec: 60,
      estimatedTimeMs: 30000,
      queuePosition: null,
    });
    await toolHandlers['aurora_ingest_video']({
      url: 'https://www.youtube.com/watch?v=abc123',
      diarize: true,
      scope: 'shared',
      whisper_model: 'large',
      language: 'sv',
    });
    expect(mockStartVideoIngestJob).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining({
        diarize: true,
        scope: 'shared',
        whisperModel: 'large',
        language: 'sv',
      }),
    );
  });

  it('shows queue position when present', async () => {
    mockStartVideoIngestJob.mockResolvedValue({
      jobId: 'queued-id',
      status: 'queued',
      videoTitle: 'Queued Video',
      videoDurationSec: 180,
      estimatedTimeMs: 120000,
      queuePosition: 3,
    });
    const result = await toolHandlers['aurora_ingest_video']({
      url: 'https://www.svt.se/nyheter/test',
    });
    expect(result.content[0].text).toContain('Position 3 in queue');
  });
});
