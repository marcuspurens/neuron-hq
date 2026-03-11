import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIngestImage = vi.fn();
vi.mock('../../../src/aurora/ocr.js', () => ({
  ingestImage: (...args: unknown[]) => mockIngestImage(...args),
}));

import { registerAuroraIngestImageTool } from '../../../src/mcp/tools/aurora-ingest-image.js';

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

describe('aurora_ingest_image MCP tool', () => {
  beforeEach(() => {
    mockIngestImage.mockReset();
    mockServer.tool.mockClear();
    registerAuroraIngestImageTool(mockServer);
  });

  it('extracts text from image', async () => {
    mockIngestImage.mockResolvedValue({
      documentNodeId: 'doc_img123',
      chunkNodeIds: ['doc_img123_chunk_0'],
      title: 'screenshot',
      wordCount: 342,
      chunkCount: 4,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    const result = await toolHandlers['aurora_ingest_image']({
      filePath: '/path/to/screenshot.png',
      language: 'sv',
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.documentNodeId).toBe('doc_img123');
    expect(data.title).toBe('screenshot');
    expect(result.isError).not.toBe(true);
    expect(mockIngestImage).toHaveBeenCalledWith(
      '/path/to/screenshot.png',
      expect.objectContaining({ language: 'sv' }),
    );
  });

  it('returns error for invalid path', async () => {
    mockIngestImage.mockRejectedValue(new Error('Unsupported image type: .xyz'));

    const result = await toolHandlers['aurora_ingest_image']({
      filePath: '/path/to/file.xyz',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unsupported image type');
  });
});
