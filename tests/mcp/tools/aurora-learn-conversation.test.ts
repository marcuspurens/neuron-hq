import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLearnFromConversation = vi.fn();
vi.mock('../../../src/aurora/conversation.js', () => ({
  learnFromConversation: (...args: unknown[]) => mockLearnFromConversation(...args),
}));

import { registerAuroraLearnConversationTool } from '../../../src/mcp/tools/aurora-learn-conversation.js';

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

describe('aurora_learn_conversation MCP tool', () => {
  beforeEach(() => {
    mockLearnFromConversation.mockReset();
    registerAuroraLearnConversationTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_learn_conversation',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns learned facts', async () => {
    const learnResult = {
      factsExtracted: 3,
      nodesCreated: 2,
      edgesCreated: 1,
      facts: ['User prefers TypeScript', 'Project uses pnpm'],
    };
    mockLearnFromConversation.mockResolvedValue(learnResult);

    const messages = [
      { role: 'user', content: 'I prefer TypeScript' },
      { role: 'assistant', content: 'Noted!' },
    ];
    const result = await toolHandler({ messages, dry_run: false });
    const data = JSON.parse(result.content[0].text);

    expect(data.factsExtracted).toBe(3);
    expect(data.nodesCreated).toBe(2);
    expect(result.isError).not.toBe(true);
  });

  it('passes dry_run parameter', async () => {
    mockLearnFromConversation.mockResolvedValue({ factsExtracted: 0 });

    const messages = [{ role: 'user', content: 'test' }];
    await toolHandler({ messages, dry_run: true });

    expect(mockLearnFromConversation).toHaveBeenCalledWith(
      messages,
      { dryRun: true },
    );
  });

  it('returns error on failure', async () => {
    mockLearnFromConversation.mockRejectedValue(new Error('Parse failed'));

    const result = await toolHandler({ messages: [], dry_run: false });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Parse failed');
  });
});
