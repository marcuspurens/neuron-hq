import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExportCommand = vi.fn();
const mockImportCommand = vi.fn();

vi.mock('../../../src/commands/obsidian-export.js', () => ({
  obsidianExportCommand: (...args: unknown[]) => mockExportCommand(...args),
}));

vi.mock('../../../src/commands/obsidian-import.js', () => ({
  obsidianImportCommand: (...args: unknown[]) => mockImportCommand(...args),
}));

import { registerAuroraObsidianTools } from '../../../src/mcp/tools/aurora-obsidian.js';

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

describe('aurora_obsidian MCP tools', () => {
  beforeEach(() => {
    mockExportCommand.mockReset();
    mockImportCommand.mockReset();
    mockServer.tool.mockClear();
    registerAuroraObsidianTools(mockServer);
  });

  it('registers two tools with correct names', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(2);
    expect(toolHandlers).toHaveProperty('aurora_obsidian_export');
    expect(toolHandlers).toHaveProperty('aurora_obsidian_import');
  });

  it('export tool returns file count', async () => {
    mockExportCommand.mockResolvedValue({ exported: 5 });

    const result = await toolHandlers['aurora_obsidian_export']({});
    const data = JSON.parse(result.content[0].text);

    expect(data.exported).toBe(5);
    expect(result.isError).not.toBe(true);
  });

  it('import tool returns stats', async () => {
    mockImportCommand.mockResolvedValue({
      filesProcessed: 3,
      highlights: 2,
      comments: 1,
      speakersRenamed: 1,
    });

    const result = await toolHandlers['aurora_obsidian_import']({});
    const data = JSON.parse(result.content[0].text);

    expect(data.filesProcessed).toBe(3);
    expect(data.highlights).toBe(2);
    expect(data.comments).toBe(1);
    expect(data.speakersRenamed).toBe(1);
    expect(result.isError).not.toBe(true);
  });

  it('export tool passes vault parameter', async () => {
    mockExportCommand.mockResolvedValue({ exported: 0 });

    await toolHandlers['aurora_obsidian_export']({ vault: '/custom/path' });

    expect(mockExportCommand).toHaveBeenCalledWith({ vault: '/custom/path' });
  });

  it('import tool passes vault parameter', async () => {
    mockImportCommand.mockResolvedValue({
      filesProcessed: 0,
      highlights: 0,
      comments: 0,
      speakersRenamed: 0,
    });

    await toolHandlers['aurora_obsidian_import']({ vault: '/custom/path' });

    expect(mockImportCommand).toHaveBeenCalledWith({ vault: '/custom/path' });
  });

  it('export tool handles errors gracefully', async () => {
    mockExportCommand.mockRejectedValue(new Error('Database connection failed'));

    const result = await toolHandlers['aurora_obsidian_export']({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Database connection failed');
  });

  it('import tool handles errors gracefully', async () => {
    mockImportCommand.mockRejectedValue(new Error('Vault not found'));

    const result = await toolHandlers['aurora_obsidian_import']({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error: Vault not found');
  });
});
