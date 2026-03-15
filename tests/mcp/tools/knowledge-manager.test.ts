import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
vi.mock('../../../src/core/agents/knowledge-manager.js', () => ({
  KnowledgeManagerAgent: vi.fn().mockImplementation(() => ({ run: mockRun })),
}));

vi.mock('../../../src/aurora/km-log.js', () => ({
  logKMRun: vi.fn().mockResolvedValue(1),
  getChainStatus: vi.fn().mockResolvedValue([]),
}));

import { registerKnowledgeManagerTool } from '../../../src/mcp/tools/knowledge-manager.js';

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

const toolHandlers: Record<string, ToolHandler> = {};
const mockServer = {
  tool: vi.fn(
    (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      toolHandlers[_name] = handler;
    },
  ),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('neuron_knowledge_manager MCP tool', () => {
  beforeEach(() => {
    mockRun.mockReset();
    registerKnowledgeManagerTool(mockServer);
  });

  it('registers both tools with correct names', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_knowledge_manager',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_km_chain_status',
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

    const result = await toolHandlers['neuron_knowledge_manager']({ maxActions: 5, includeStale: true });
    const data = JSON.parse(result.content[0].text);

    expect(data.gapsFound).toBe(5);
    expect(data.gapsResearched).toBe(3);
    expect(result.isError).not.toBe(true);
  });

  it('returns error on failure', async () => {
    mockRun.mockRejectedValue(new Error('DB unavailable'));

    const result = await toolHandlers['neuron_knowledge_manager']({ maxActions: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DB unavailable');
  });

  it('accepts chain parameter and passes to agent constructor', async () => {
    mockRun.mockResolvedValue({
      gapsFound: 3,
      gapsResearched: 2,
      sourcesRefreshed: 0,
      newNodesCreated: 2,
      summary: 'Chain test',
      chainId: 'chain-123',
      stoppedBy: 'convergence',
    });

    const result = await toolHandlers['neuron_knowledge_manager']({ maxActions: 5, includeStale: true });

    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.gapsFound).toBe(3);
  });

  it('passes chain:true context to agent when chain fields in response', async () => {
    mockRun.mockResolvedValue({
      gapsFound: 10,
      gapsResearched: 8,
      sourcesRefreshed: 2,
      newNodesCreated: 5,
      summary: 'Chain run: 3 cycles, stopped by convergence.',
      chainId: 'chain-abc',
      totalCycles: 3,
      stoppedBy: 'convergence',
      emergentGapsFound: 12,
    });

    const result = await toolHandlers['neuron_knowledge_manager']({ maxActions: 10 });

    expect(result.isError).not.toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.chainId).toBe('chain-abc');
    expect(data.totalCycles).toBe(3);
    expect(data.stoppedBy).toBe('convergence');
    expect(data.emergentGapsFound).toBe(12);
  });
});
