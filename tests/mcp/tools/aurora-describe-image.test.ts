import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyzeImage = vi.fn();
const mockIngestImage = vi.fn();
vi.mock('../../../src/aurora/vision.js', () => ({
  analyzeImage: (...args: unknown[]) => mockAnalyzeImage(...args),
  ingestImage: (...args: unknown[]) => mockIngestImage(...args),
}));

import { registerAuroraDescribeImageTool } from '../../../src/mcp/tools/aurora-describe-image.js';

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

describe('aurora_describe_image MCP tool', () => {
  beforeEach(() => {
    mockAnalyzeImage.mockReset();
    mockIngestImage.mockReset();
    mockServer.tool.mockClear();
    registerAuroraDescribeImageTool(mockServer);
  });

  it('describes and ingests image', async () => {
    mockIngestImage.mockResolvedValue({
      description: 'A photo of a cat',
      modelUsed: 'qwen3-vl:8b',
      documentNodeId: 'doc_vis123',
      chunkCount: 2,
      crossRefsCreated: 1,
    });

    const result = await toolHandlers['aurora_describe_image']({
      imagePath: '/path/to/cat.jpg',
      describeOnly: false,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Analyzed with');
    expect(result.content[0].text).toContain('A photo of a cat');
    expect(result.content[0].text).toContain('Indexed');
  });

  it('describe-only returns just description', async () => {
    mockAnalyzeImage.mockResolvedValue({
      description: 'A diagram',
      modelUsed: 'qwen3-vl:8b',
    });

    const result = await toolHandlers['aurora_describe_image']({
      imagePath: '/path/to/diagram.png',
      describeOnly: true,
    });

    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Model:');
    expect(result.content[0].text).toContain('A diagram');
    expect(mockIngestImage).not.toHaveBeenCalled();
  });

  it('returns error for missing file', async () => {
    mockAnalyzeImage.mockRejectedValue(new Error('ENOENT: no such file'));

    const result = await toolHandlers['aurora_describe_image']({
      imagePath: '/missing.png',
      describeOnly: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ENOENT');
  });
});
