import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOcrPdf = vi.fn();
vi.mock('../../../src/aurora/ocr.js', () => ({
  ocrPdf: (...args: unknown[]) => mockOcrPdf(...args),
}));

import { registerAuroraOcrPdfTool } from '../../../src/mcp/tools/aurora-ocr-pdf.js';

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

describe('aurora_ocr_pdf MCP tool', () => {
  beforeEach(() => {
    mockOcrPdf.mockReset();
    mockServer.tool.mockClear();
    registerAuroraOcrPdfTool(mockServer);
  });

  it('extracts text from PDF via OCR', async () => {
    mockOcrPdf.mockResolvedValue({
      documentNodeId: 'doc_pdf123',
      chunkNodeIds: ['doc_pdf123_chunk_0'],
      title: 'broken-report',
      wordCount: 500,
      chunkCount: 6,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    const result = await toolHandlers['aurora_ocr_pdf']({
      filePath: '/path/to/report.pdf',
      language: 'sv',
      dpi: 300,
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.documentNodeId).toBe('doc_pdf123');
    expect(data.title).toBe('broken-report');
    expect(result.isError).not.toBe(true);
  });

  it('passes language and dpi options', async () => {
    mockOcrPdf.mockResolvedValue({
      documentNodeId: 'doc_pdf456',
      chunkNodeIds: [],
      title: 'test',
      wordCount: 10,
      chunkCount: 1,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    await toolHandlers['aurora_ocr_pdf']({
      filePath: '/path/to/test.pdf',
      language: 'de',
      dpi: 150,
    });

    expect(mockOcrPdf).toHaveBeenCalledWith(
      '/path/to/test.pdf',
      expect.objectContaining({ language: 'de', dpi: 150 }),
    );
  });
});
