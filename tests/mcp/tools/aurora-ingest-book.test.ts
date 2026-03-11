import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIngestImageBatch = vi.fn();
vi.mock('../../../src/aurora/ocr.js', () => ({
  ingestImageBatch: (...args: unknown[]) => mockIngestImageBatch(...args),
}));

import { registerAuroraIngestBookTool } from '../../../src/mcp/tools/aurora-ingest-book.js';

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

describe('aurora_ingest_book MCP tool', () => {
  beforeEach(() => {
    mockIngestImageBatch.mockReset();
    mockServer.tool.mockClear();
    registerAuroraIngestBookTool(mockServer);
  });

  it('batch OCR a folder of images', async () => {
    mockIngestImageBatch.mockResolvedValue({
      documentNodeId: 'doc_batch123',
      chunkNodeIds: ['doc_batch123_chunk_0'],
      title: 'Scanned Book',
      wordCount: 5000,
      chunkCount: 25,
      crossRefsCreated: 3,
      crossRefMatches: [],
      pageCount: 47,
      avgConfidence: 0.892,
      files: ['page001.png', 'page002.png'],
    });

    const result = await toolHandlers['aurora_ingest_book']({
      folderPath: '/path/to/scans',
      language: 'sv',
      title: 'Scanned Book',
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.documentNodeId).toBe('doc_batch123');
    expect(data.pageCount).toBe(47);
    expect(data.avgConfidence).toBe(0.892);
    expect(result.isError).not.toBe(true);
    expect(mockIngestImageBatch).toHaveBeenCalledWith(
      '/path/to/scans',
      expect.objectContaining({ language: 'sv', title: 'Scanned Book' }),
    );
  });

  it('returns error for invalid folder', async () => {
    mockIngestImageBatch.mockRejectedValue(
      new Error('Not a directory: /path/to/nonexistent'),
    );

    const result = await toolHandlers['aurora_ingest_book']({
      folderPath: '/path/to/nonexistent',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not a directory');
  });

  it('passes all options to ingestImageBatch', async () => {
    mockIngestImageBatch.mockResolvedValue({
      documentNodeId: 'doc_batch456',
      chunkNodeIds: [],
      title: 'My Book',
      wordCount: 100,
      chunkCount: 1,
      crossRefsCreated: 0,
      crossRefMatches: [],
      pageCount: 2,
      avgConfidence: 0.95,
      files: ['p1.png', 'p2.png'],
    });

    await toolHandlers['aurora_ingest_book']({
      folderPath: '/tmp/scans',
      language: 'de',
      title: 'My Book',
      outputPath: '/tmp/book.md',
    });

    expect(mockIngestImageBatch).toHaveBeenCalledWith(
      '/tmp/scans',
      expect.objectContaining({
        language: 'de',
        title: 'My Book',
        outputPath: '/tmp/book.md',
      }),
    );
  });
});
