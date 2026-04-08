import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockParseFacit = vi.fn();
const mockEvalPdfPage = vi.fn();
const mockEvalFromPipelineJson = vi.fn();
const mockFormatEvalSummary = vi.fn();

vi.mock('../../../src/aurora/pdf-eval.js', () => ({
  parseFacit: (...args: unknown[]) => mockParseFacit(...args),
  evalPdfPage: (...args: unknown[]) => mockEvalPdfPage(...args),
  evalFromPipelineJson: (...args: unknown[]) => mockEvalFromPipelineJson(...args),
  formatEvalSummary: (...args: unknown[]) => mockFormatEvalSummary(...args),
}));

import { registerAuroraPdfEvalTool } from '../../../src/mcp/tools/aurora-pdf-eval.js';

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

const sampleEvalResult = {
  page: 10,
  source: 'ungdomsbarometern.pdf',
  textScore: 0.8,
  visionScore: 0.75,
  combinedScore: 0.77,
  details: {
    textContains: [{ expected: 'arbetsgivare', found: true }],
    textMinChars: { expected: 100, actual: 500, pass: true },
    textGarbled: { expected: false, actual: false, pass: true },
    visionType: { expected: 'bar_chart', actual: 'bar_chart', match: true },
    visionTitle: { expected: 'Topp 10', found: true },
    dataPoints: [],
    negativesClean: [],
  },
};

describe('aurora_pdf_eval MCP tool', () => {
  beforeEach(() => {
    mockParseFacit.mockReset();
    mockEvalPdfPage.mockReset();
    mockEvalFromPipelineJson.mockReset();
    mockFormatEvalSummary.mockReset();
    mockServer.tool.mockClear();
    registerAuroraPdfEvalTool(mockServer);
  });

  it('registers the tool', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_pdf_eval',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
    expect(toolHandlers['aurora_pdf_eval']).toBeDefined();
  });

  it('returns error when facit path does not exist', async () => {
    const result = await toolHandlers['aurora_pdf_eval']({
      facit_path: '/nonexistent/path.yaml',
      format: 'summary',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error:');
  });
});
