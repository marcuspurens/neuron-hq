import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifySource = vi.fn();
vi.mock('../../../src/aurora/freshness.js', () => ({
  verifySource: (...args: unknown[]) => mockVerifySource(...args),
}));

import { registerAuroraVerifyTool } from '../../../src/mcp/tools/aurora-verify.js';

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

describe('aurora_verify_source MCP tool', () => {
  beforeEach(() => {
    mockVerifySource.mockReset();
    registerAuroraVerifyTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_verify_source',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns success when node found', async () => {
    mockVerifySource.mockResolvedValue(true);

    const result = await toolHandler({ node_id: 'src-1' });

    expect(result.content[0].text).toContain('marked as verified');
    expect(result.isError).not.toBe(true);
    expect(mockVerifySource).toHaveBeenCalledWith('src-1');
  });

  it('returns not-found when node missing', async () => {
    mockVerifySource.mockResolvedValue(false);

    const result = await toolHandler({ node_id: 'nonexistent' });

    expect(result.content[0].text).toContain('not found');
    expect(result.isError).not.toBe(true);
  });

  it('returns error on failure', async () => {
    mockVerifySource.mockRejectedValue(new Error('DB unavailable'));

    const result = await toolHandler({ node_id: 'src-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB unavailable');
  });
});
