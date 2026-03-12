import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSuggestResearch = vi.fn();
const mockSuggestResearchBatch = vi.fn();
vi.mock('../../../src/aurora/gap-brief.js', () => ({
  suggestResearch: (...args: unknown[]) => mockSuggestResearch(...args),
  suggestResearchBatch: (...args: unknown[]) => mockSuggestResearchBatch(...args),
}));

import { registerAuroraSuggestResearchTool } from '../../../src/mcp/tools/aurora-suggest-research.js';

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

describe('aurora_suggest_research MCP tool', () => {
  beforeEach(() => {
    mockSuggestResearch.mockReset();
    mockSuggestResearchBatch.mockReset();
    registerAuroraSuggestResearchTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_suggest_research',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('uses suggestResearch when question provided', async () => {
    const suggestion = {
      question: 'What is RAG?',
      knownFacts: ['RAG uses retrieval'],
      suggestedSources: ['arxiv'],
    };
    mockSuggestResearch.mockResolvedValue(suggestion);

    const result = await toolHandler({ question: 'What is RAG?', max_facts: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data.question).toBe('What is RAG?');
    expect(mockSuggestResearch).toHaveBeenCalledWith('What is RAG?', { maxFacts: 10 });
    expect(mockSuggestResearchBatch).not.toHaveBeenCalled();
    expect(result.isError).not.toBe(true);
  });

  it('uses suggestResearchBatch when no question', async () => {
    const batchResult = [
      { question: 'Gap 1', knownFacts: [], suggestedSources: [] },
    ];
    mockSuggestResearchBatch.mockResolvedValue(batchResult);

    const result = await toolHandler({ top: 3, max_facts: 5 });
    const data = JSON.parse(result.content[0].text);

    expect(data).toHaveLength(1);
    expect(mockSuggestResearchBatch).toHaveBeenCalledWith({ topN: 3, maxFacts: 5 });
    expect(mockSuggestResearch).not.toHaveBeenCalled();
    expect(result.isError).not.toBe(true);
  });

  it('returns error on failure', async () => {
    mockSuggestResearchBatch.mockRejectedValue(new Error('No gaps found'));

    const result = await toolHandler({ top: 3, max_facts: 10 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No gaps found');
  });
});
