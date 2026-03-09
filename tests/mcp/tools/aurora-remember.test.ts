import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRemember = vi.fn();
vi.mock('../../../src/aurora/memory.js', () => ({
  remember: (...args: unknown[]) => mockRemember(...args),
}));

import { registerAuroraRememberTool } from '../../../src/mcp/tools/aurora-remember.js';

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

describe('aurora_remember MCP tool', () => {
  beforeEach(() => {
    mockRemember.mockReset();
    registerAuroraRememberTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_remember',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns RememberResult as JSON', async () => {
    mockRemember.mockResolvedValue({
      action: 'created',
      nodeId: 'new-1',
    });

    const result = await toolHandler({ text: 'Test fact', type: 'fact', scope: 'personal' });
    const data = JSON.parse(result.content[0].text);

    expect(data.action).toBe('created');
    expect(data.nodeId).toBe('new-1');
    expect(result.isError).not.toBe(true);
  });

  it('handles all parameters', async () => {
    mockRemember.mockResolvedValue({ action: 'created', nodeId: 'n1' });

    await toolHandler({
      text: 'Tagged fact',
      type: 'preference',
      scope: 'shared',
      tags: ['a', 'b'],
      source: 'manual',
    });

    expect(mockRemember).toHaveBeenCalledWith(
      'Tagged fact',
      expect.objectContaining({
        type: 'preference',
        scope: 'shared',
        tags: ['a', 'b'],
        source: 'manual',
      }),
    );
  });

  it('returns error on failure', async () => {
    mockRemember.mockRejectedValue(new Error('Save failed'));

    const result = await toolHandler({ text: 'broken' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Save failed');
  });
});
