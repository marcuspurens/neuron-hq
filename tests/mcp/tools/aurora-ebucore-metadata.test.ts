import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadAuroraGraph = vi.fn();
const mockFindAuroraNodes = vi.fn();

vi.mock('../../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
}));

import { registerAuroraEbucoreMetadataTool } from '../../../src/mcp/tools/aurora-ebucore-metadata.js';

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

const mockGraph = {
  nodes: [
    {
      id: 'test-transcript',
      type: 'transcript',
      title: 'Test Video',
      properties: {
        duration: 120,
        language: 'sv',
        publishedDate: '2024-01-01',
        videoUrl: 'https://youtube.com/watch?v=abc',
        platform: 'youtube',
        segmentCount: 10,
      },
      confidence: 0.9,
      scope: 'personal',
      sourceUrl: 'https://youtube.com/watch?v=abc',
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'test-voice-print',
      type: 'voice_print',
      title: 'Speaker: Alice',
      properties: { speakerLabel: 'Alice', totalDurationMs: 50000, segmentCount: 5 },
      confidence: 0.7,
      scope: 'personal',
      sourceUrl: null,
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
    },
  ],
  edges: [],
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

describe('aurora_ebucore_metadata MCP tool', () => {
  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockFindAuroraNodes.mockReset();
    registerAuroraEbucoreMetadataTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'aurora_ebucore_metadata',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('ebucore_metadata returns metadata, validation, and standards for a valid transcript node', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    const result = await toolHandler({ action: 'ebucore_metadata', nodeId: 'test-transcript' });
    const data = JSON.parse(result.content[0].text);

    expect(data.metadata['ebucore:duration']).toBe(120);
    expect(data.metadata['ebucore:hasLanguage']).toBe('sv');
    expect(data.metadata['ebucore:title']).toBe('Test Video');
    expect(data.metadata['ebucore:locator']).toBe('https://youtube.com/watch?v=abc');
    expect(data.validation.complete).toBe(true);
    expect(data.validation.missing).toEqual([]);
    expect(data.standards).toContain('EBUCore 1.10');
    expect(data.standards).toContain('Dublin Core');
    expect(result.isError).not.toBe(true);
  });

  it('ebucore_metadata returns error when nodeId is missing', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    const result = await toolHandler({ action: 'ebucore_metadata' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('nodeId required');
  });

  it('ebucore_metadata returns error for non-existent node', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    const result = await toolHandler({ action: 'ebucore_metadata', nodeId: 'does-not-exist' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Node not found');
  });

  it('metadata_coverage returns coverage report', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);
    mockFindAuroraNodes.mockReturnValue(mockGraph.nodes);

    const result = await toolHandler({ action: 'metadata_coverage' });
    const data = JSON.parse(result.content[0].text);

    expect(data.totalNodes).toBe(2);
    expect(data.coveredNodes).toBe(2);
    expect(data.coveragePercent).toBe(100);
    expect(data.byType).toHaveProperty('transcript');
    expect(data.byType).toHaveProperty('voice_print');
    expect(result.isError).not.toBe(true);
  });

  it('metadata_coverage with empty graph returns zeros', async () => {
    const emptyGraph = { nodes: [], edges: [], lastUpdated: '2024-01-01T00:00:00.000Z' };
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph);
    mockFindAuroraNodes.mockReturnValue([]);

    const result = await toolHandler({ action: 'metadata_coverage' });
    const data = JSON.parse(result.content[0].text);

    expect(data.totalNodes).toBe(0);
    expect(data.coveredNodes).toBe(0);
    expect(data.coveragePercent).toBe(0);
    expect(result.isError).not.toBe(true);
  });

  it('ebucore_metadata works for voice_print nodes', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    const result = await toolHandler({ action: 'ebucore_metadata', nodeId: 'test-voice-print' });
    const data = JSON.parse(result.content[0].text);

    expect(data.metadata['ebucore:speakerName']).toBe('Alice');
    expect(data.metadata['ebucore:speakerDuration']).toBe(50000);
    expect(data.metadata['ebucore:numberOfSegments']).toBe(5);
    expect(data.standards).toEqual(['EBUCore 1.10']);
    expect(result.isError).not.toBe(true);
  });

  it('returns error when loadAuroraGraph fails', async () => {
    mockLoadAuroraGraph.mockRejectedValue(new Error('Graph unavailable'));

    const result = await toolHandler({ action: 'ebucore_metadata', nodeId: 'test-transcript' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Graph unavailable');
  });
});
