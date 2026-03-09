import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAsk = vi.fn();
vi.mock('../../../src/aurora/ask.js', () => ({
  ask: (...args: unknown[]) => mockAsk(...args),
}));

import { registerAuroraAskTool } from '../../../src/mcp/tools/aurora-ask.js';

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

describe('aurora_ask MCP tool', () => {
  beforeEach(() => {
    mockAsk.mockReset();
    registerAuroraAskTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_ask',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns AskResult as JSON', async () => {
    mockAsk.mockResolvedValue({
      answer: 'The answer is 42.',
      citations: [
        { nodeId: 'doc-1', title: 'Guide', type: 'document', similarity: 0.9 },
      ],
      sourcesUsed: 1,
      noSourcesFound: false,
    });

    const result = await toolHandler({
      question: 'What is the answer?',
      max_sources: 10,
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.answer).toBe('The answer is 42.');
    expect(data.citations).toHaveLength(1);
    expect(data.sourcesUsed).toBe(1);
    expect(data.noSourcesFound).toBe(false);
    expect(result.isError).not.toBe(true);
  });

  it('handles empty database gracefully', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Inga relevanta källor hittades i kunskapsbasen för din fråga.',
      citations: [],
      sourcesUsed: 0,
      noSourcesFound: true,
    });

    const result = await toolHandler({
      question: 'unknown topic',
      max_sources: 10,
    });
    const data = JSON.parse(result.content[0].text);

    expect(data.noSourcesFound).toBe(true);
    expect(data.citations).toEqual([]);
    expect(data.sourcesUsed).toBe(0);
    expect(result.isError).not.toBe(true);
  });

  it('passes max_sources parameter', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Result',
      citations: [],
      sourcesUsed: 0,
      noSourcesFound: true,
    });

    await toolHandler({
      question: 'test',
      max_sources: 5,
    });

    expect(mockAsk).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ maxSources: 5 }),
    );
  });

  it('returns error on failure', async () => {
    mockAsk.mockRejectedValue(new Error('LLM unavailable'));

    const result = await toolHandler({
      question: 'broken',
      max_sources: 10,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: LLM unavailable');
  });

  it('passes type and scope', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Result',
      citations: [],
      sourcesUsed: 0,
      noSourcesFound: true,
    });

    await toolHandler({
      question: 'test',
      type: 'fact',
      scope: 'shared',
      max_sources: 10,
    });

    expect(mockAsk).toHaveBeenCalledWith('test', {
      maxSources: 10,
      type: 'fact',
      scope: 'shared',
    });
  });
});
