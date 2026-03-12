import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bayesian-confidence module
const mockGetConfidenceHistory = vi.fn();
vi.mock('../../../src/aurora/bayesian-confidence.js', () => ({
  getConfidenceHistory: (...args: unknown[]) => mockGetConfidenceHistory(...args),
}));

import { registerAuroraConfidenceTool } from '../../../src/mcp/tools/aurora-confidence.js';

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

describe('aurora_confidence_history MCP tool', () => {
  beforeEach(() => {
    mockGetConfidenceHistory.mockReset();
    mockServer.tool.mockClear();
    registerAuroraConfidenceTool(mockServer);
  });

  it('returns confidence history', async () => {
    mockGetConfidenceHistory.mockResolvedValue([
      {
        id: 1,
        nodeId: 'doc_abc',
        oldConfidence: 0.5,
        newConfidence: 0.5622,
        direction: 'supports',
        sourceType: 'academic',
        weight: 0.25,
        reason: 'Test reason',
        metadata: {},
        timestamp: '2026-03-12T10:00:00.000Z',
      },
    ]);
    const result = await toolHandlers['aurora_confidence_history']({
      nodeId: 'doc_abc',
      limit: 20,
    });
    expect(result.content[0].text).toContain('doc_abc');
    expect(result.isError).toBeUndefined();
  });

  it('returns error for failing query', async () => {
    mockGetConfidenceHistory.mockRejectedValue(new Error('DB connection failed'));
    const result = await toolHandlers['aurora_confidence_history']({
      nodeId: 'doc_missing',
      limit: 20,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB connection failed');
  });
});
