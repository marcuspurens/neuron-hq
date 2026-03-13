import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
vi.mock('../../../src/core/agents/knowledge-manager.js', () => ({
  KnowledgeManagerAgent: vi.fn().mockImplementation(() => ({ run: mockRun })),
}));

import { registerKnowledgeManagerTool } from '../../../src/mcp/tools/knowledge-manager.js';

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

describe('neuron_knowledge_manager MCP tool', () => {
  beforeEach(() => {
    mockRun.mockReset();
    registerKnowledgeManagerTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_knowledge_manager',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns KMReport as JSON', async () => {
    mockRun.mockResolvedValue({
      gapsFound: 5,
      gapsResearched: 3,
      sourcesRefreshed: 1,
      newNodesCreated: 4,
      summary: 'Test',
    });

    const result = await toolHandler({ maxActions: 5, includeStale: true });
    const data = JSON.parse(result.content[0].text);

    expect(data.gapsFound).toBe(5);
    expect(data.gapsResearched).toBe(3);
    expect(result.isError).not.toBe(true);
  });

  it('returns error on failure', async () => {
    mockRun.mockRejectedValue(new Error('DB unavailable'));

    const result = await toolHandler({ maxActions: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB unavailable');
  });
});
