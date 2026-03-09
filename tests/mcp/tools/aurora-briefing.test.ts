import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBriefing = vi.fn();
vi.mock('../../../src/aurora/briefing.js', () => ({
  briefing: (...args: unknown[]) => mockBriefing(...args),
}));

import { registerAuroraBriefingTool } from '../../../src/mcp/tools/aurora-briefing.js';

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

function defaultBriefingResult() {
  return {
    topic: 'TypeScript',
    summary: 'Vi har 1 fakta om TypeScript.',
    facts: [
      { title: 'TypeScript strict mode', type: 'fact', confidence: 0.8, similarity: 0.92 },
    ],
    timeline: [
      { title: 'TypeScript Best Practices', type: 'document', createdAt: '2026-03-09T10:00:00Z', confidence: 0.9 },
    ],
    gaps: [],
    crossRefs: { neuron: [], aurora: [] },
    metadata: {
      generatedAt: '2026-03-09T15:00:00Z',
      totalSources: 2,
      totalGaps: 0,
      totalCrossRefs: 0,
    },
  };
}

describe('aurora_briefing MCP tool', () => {
  beforeEach(() => {
    mockBriefing.mockReset();
    registerAuroraBriefingTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_briefing',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns BriefingResult as JSON', async () => {
    mockBriefing.mockResolvedValue(defaultBriefingResult());

    const result = await toolHandler({ topic: 'TypeScript' });
    const data = JSON.parse(result.content[0].text);

    expect(data.topic).toBe('TypeScript');
    expect(data.summary).toContain('fakta');
    expect(data.facts).toHaveLength(1);
    expect(data.metadata.totalSources).toBe(2);
    expect(result.isError).not.toBe(true);
  });

  it('passes parameters to briefing()', async () => {
    mockBriefing.mockResolvedValue(defaultBriefingResult());

    await toolHandler({
      topic: 'TypeScript',
      max_facts: 3,
      max_timeline: 5,
      max_gaps: 2,
      max_cross_refs: 1,
    });

    expect(mockBriefing).toHaveBeenCalledWith('TypeScript', {
      maxFacts: 3,
      maxTimeline: 5,
      maxGaps: 2,
      maxCrossRefs: 1,
    });
  });

  it('returns error on failure', async () => {
    mockBriefing.mockRejectedValue(new Error('Database connection failed'));

    const result = await toolHandler({ topic: 'broken' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Database connection failed');
  });
});
