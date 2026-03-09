import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckCrossRefIntegrity = vi.fn();
vi.mock('../../../src/aurora/cross-ref.js', () => ({
  checkCrossRefIntegrity: (...args: unknown[]) =>
    mockCheckCrossRefIntegrity(...args),
}));

import { registerCrossRefIntegrityTool } from '../../../src/mcp/tools/cross-ref-integrity.js';

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

let toolHandler: ToolHandler;
const mockServer = {
  tool: vi.fn(
    (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      toolHandler = handler;
    },
  ),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('aurora_cross_ref_integrity MCP tool', () => {
  beforeEach(() => {
    mockCheckCrossRefIntegrity.mockReset();
    registerCrossRefIntegrityTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_cross_ref_integrity',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns issues as JSON', async () => {
    mockCheckCrossRefIntegrity.mockResolvedValue([
      {
        crossRefId: 1,
        neuronNodeId: 'n-001',
        neuronTitle: 'Flaky pattern',
        neuronConfidence: 0.3,
        auroraNodeId: 'a-001',
        auroraTitle: 'Research doc',
        issue: 'low_confidence',
      },
    ]);

    const result = await toolHandler({
      confidence_threshold: 0.5,
      limit: 20,
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.totalIssues).toBe(1);
    expect(data.threshold).toBe(0.5);
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].neuronNodeId).toBe('n-001');
    expect(data.issues[0].neuronConfidence).toBe(0.3);
    expect(data.issues[0].issue).toBe('low_confidence');
    expect(result.isError).not.toBe(true);
  });

  it('handles empty results', async () => {
    mockCheckCrossRefIntegrity.mockResolvedValue([]);

    const result = await toolHandler({
      confidence_threshold: 0.5,
      limit: 20,
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.totalIssues).toBe(0);
    expect(data.issues).toEqual([]);
    expect(result.isError).not.toBe(true);
  });

  it('passes options to checkCrossRefIntegrity', async () => {
    mockCheckCrossRefIntegrity.mockResolvedValue([]);

    await toolHandler({ confidence_threshold: 0.7, limit: 10 });

    expect(mockCheckCrossRefIntegrity).toHaveBeenCalledWith({
      confidenceThreshold: 0.7,
      limit: 10,
    });
  });

  it('returns error on failure', async () => {
    mockCheckCrossRefIntegrity.mockRejectedValue(new Error('DB unavailable'));

    const result = await toolHandler({
      confidence_threshold: 0.5,
      limit: 20,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB unavailable');
  });
});
