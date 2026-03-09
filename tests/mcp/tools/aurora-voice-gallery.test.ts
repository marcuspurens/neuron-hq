import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraNode } from '../../../src/aurora/aurora-schema.js';

const mockLoadAuroraGraph = vi.fn();
vi.mock('../../../src/aurora/aurora-graph.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/aurora/aurora-graph.js')
  >('../../../src/aurora/aurora-graph.js');
  return {
    ...actual,
    loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  };
});

vi.mock('../../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

import { registerAuroraVoiceGalleryTool } from '../../../src/mcp/tools/aurora-voice-gallery.js';

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

const toolHandlers: Record<string, ToolHandler> = {};
const mockServer = {
  tool: vi.fn(
    (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      toolHandlers[name] = handler;
    },
  ),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('aurora_voice_gallery MCP tool', () => {
  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockServer.tool.mockClear();
    registerAuroraVoiceGalleryTool(mockServer);
  });

  it('registers tool with correct name', () => {
    expect(toolHandlers).toHaveProperty('aurora_voice_gallery');
  });

  it('returns empty message when no voice prints exist', async () => {
    mockLoadAuroraGraph.mockResolvedValue({
      nodes: [],
      edges: [],
      lastUpdated: new Date().toISOString(),
    });

    const result = await toolHandlers['aurora_voice_gallery']({});
    expect(result.content[0].text).toContain('No voice prints found');
    expect(result.isError).not.toBe(true);
  });

  it('returns voice prints when they exist', async () => {
    const now = new Date().toISOString();
    const voicePrintNode: AuroraNode = {
      id: 'vp-abc123-SPEAKER_1',
      type: 'voice_print',
      title: 'Speaker: SPEAKER_1',
      properties: {
        speakerLabel: 'SPEAKER_1',
        videoId: 'abc123',
        segmentCount: 3,
        totalDurationMs: 15000,
      },
      confidence: 0.7,
      scope: 'personal',
      created: now,
      updated: now,
    };

    mockLoadAuroraGraph.mockResolvedValue({
      nodes: [voicePrintNode],
      edges: [],
      lastUpdated: now,
    });

    const result = await toolHandlers['aurora_voice_gallery']({});
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(1);
    expect(data.voicePrints[0].id).toBe('vp-abc123-SPEAKER_1');
    expect(data.voicePrints[0].speakerLabel).toBe('SPEAKER_1');
  });

  it('handles errors gracefully', async () => {
    mockLoadAuroraGraph.mockRejectedValue(new Error('db error'));
    const result = await toolHandlers['aurora_voice_gallery']({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('db error');
  });
});
