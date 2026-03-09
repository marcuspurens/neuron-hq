import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIngestUrl = vi.fn();
const mockIngestDocument = vi.fn();
vi.mock('../../../src/aurora/intake.js', () => ({
  ingestUrl: (...args: unknown[]) => mockIngestUrl(...args),
  ingestDocument: (...args: unknown[]) => mockIngestDocument(...args),
}));

import { registerAuroraIngestTools } from '../../../src/mcp/tools/aurora-ingest.js';

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

describe('aurora_ingest MCP tools', () => {
  beforeEach(() => {
    mockIngestUrl.mockReset();
    mockIngestDocument.mockReset();
    mockServer.tool.mockClear();
    registerAuroraIngestTools(mockServer);
  });

  it('registers two tools with correct names', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(2);
    expect(toolHandlers).toHaveProperty('aurora_ingest_url');
    expect(toolHandlers).toHaveProperty('aurora_ingest_doc');
  });

  it('aurora_ingest_url returns IngestResult', async () => {
    mockIngestUrl.mockResolvedValue({
      documentNodeId: 'doc_abc123',
      chunkNodeIds: ['doc_abc123_chunk_0', 'doc_abc123_chunk_1'],
      title: 'Test Article',
      wordCount: 500,
      chunkCount: 2,
    });

    const result = await toolHandlers['aurora_ingest_url']({ url: 'https://example.com' });
    const data = JSON.parse(result.content[0].text);

    expect(data.documentNodeId).toBe('doc_abc123');
    expect(data.chunkNodeIds).toEqual(['doc_abc123_chunk_0', 'doc_abc123_chunk_1']);
    expect(data.title).toBe('Test Article');
    expect(result.isError).not.toBe(true);
  });

  it('aurora_ingest_url passes scope and type options', async () => {
    mockIngestUrl.mockResolvedValue({
      documentNodeId: 'doc_1',
      chunkNodeIds: [],
      title: 'Research',
      wordCount: 100,
      chunkCount: 0,
    });

    await toolHandlers['aurora_ingest_url']({
      url: 'https://example.com',
      scope: 'shared',
      type: 'research',
    });

    expect(mockIngestUrl).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ scope: 'shared', type: 'research' }),
    );
  });

  it('aurora_ingest_doc returns IngestResult', async () => {
    mockIngestDocument.mockResolvedValue({
      documentNodeId: 'doc_xyz789',
      chunkNodeIds: [],
      title: 'Notes',
      wordCount: 50,
      chunkCount: 0,
    });

    const result = await toolHandlers['aurora_ingest_doc']({ path: './doc.md' });
    const data = JSON.parse(result.content[0].text);

    expect(data.documentNodeId).toBe('doc_xyz789');
    expect(data.title).toBe('Notes');
    expect(result.isError).not.toBe(true);
  });

  it('aurora_ingest_url returns error on failure', async () => {
    mockIngestUrl.mockRejectedValue(new Error('Worker failed'));

    const result = await toolHandlers['aurora_ingest_url']({ url: 'https://bad.com' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Worker failed');
  });

  it('aurora_ingest_doc returns error on failure', async () => {
    mockIngestDocument.mockRejectedValue(new Error('File not found'));

    const result = await toolHandlers['aurora_ingest_doc']({ path: './missing.md' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error:');
  });
});
