import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUnifiedSearch = vi.fn();
vi.mock('../../../src/aurora/cross-ref.js', () => ({
  unifiedSearch: (...args: unknown[]) => mockUnifiedSearch(...args),
}));

import { registerCrossRefTool } from '../../../src/mcp/tools/cross-ref.js';

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

describe('neuron_cross_ref MCP tool', () => {
  beforeEach(() => {
    mockUnifiedSearch.mockReset();
    registerCrossRefTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_cross_ref',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns unified search results in correct format', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [
        {
          node: { id: 'p-1', title: 'Pattern', type: 'pattern', confidence: 0.8 },
          source: 'neuron',
          similarity: 0.9,
        },
      ],
      auroraResults: [
        {
          node: { id: 'doc-1', title: 'Doc', type: 'document', confidence: 1.0 },
          source: 'aurora',
          similarity: 0.85,
        },
      ],
      crossRefs: [
        { id: 1, neuronNodeId: 'p-1', auroraNodeId: 'doc-1', relationship: 'enriches' },
      ],
    });

    const result = await toolHandler({
      query: 'test',
      limit: 10,
      min_similarity: 0.3,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.neuron).toHaveLength(1);
    expect(parsed.neuron[0].id).toBe('p-1');
    expect(parsed.aurora).toHaveLength(1);
    expect(parsed.aurora[0].id).toBe('doc-1');
    expect(parsed.totalCrossRefs).toBe(1);
  });

  it('passes parameters correctly', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });

    await toolHandler({
      query: 'typescript',
      limit: 5,
      min_similarity: 0.5,
      type: 'pattern',
    });

    expect(mockUnifiedSearch).toHaveBeenCalledWith('typescript', {
      limit: 5,
      minSimilarity: 0.5,
      type: 'pattern',
    });
  });

  it('handles empty results', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });

    const result = await toolHandler({ query: 'nothing' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.neuron).toHaveLength(0);
    expect(parsed.aurora).toHaveLength(0);
    expect(parsed.totalCrossRefs).toBe(0);
  });

  it('returns error on failure', async () => {
    mockUnifiedSearch.mockRejectedValue(new Error('Connection failed'));

    const result = await toolHandler({ query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Connection failed');
  });
});
