import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCallMediaTool = vi.fn();
vi.mock('../../../src/aurora/media-client.js', () => ({
  callMediaTool: (...args: unknown[]) => mockCallMediaTool(...args),
}));

import { registerAuroraCheckDepsTool } from '../../../src/mcp/tools/aurora-check-deps.js';

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

describe('aurora_check_deps MCP tool', () => {
  beforeEach(() => {
    mockCallMediaTool.mockReset();
    mockServer.tool.mockClear();
    registerAuroraCheckDepsTool(mockServer);
  });

  it('registers tool with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(1);
    expect(toolHandlers).toHaveProperty('aurora_check_deps');
  });

  it('returns dependency info on success', async () => {
    mockCallMediaTool.mockResolvedValue({
      ok: true,
      title: '',
      text: '',
      metadata: { source_type: 'text', word_count: 0 },
      deps: { whisper: true, yt_dlp: true },
    });

    const result = await toolHandlers['aurora_check_deps']({
      preload_models: false,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.ok).toBe(true);
    expect(data.deps.whisper).toBe(true);
    expect(result.isError).not.toBe(true);
  });

  it('returns error when worker reports failure', async () => {
    mockCallMediaTool.mockResolvedValue({
      ok: false,
      error: 'Python not found',
    });

    const result = await toolHandlers['aurora_check_deps']({
      preload_models: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Python not found');
  });

  it('handles thrown errors', async () => {
    mockCallMediaTool.mockRejectedValue(new Error('spawn failed'));

    const result = await toolHandlers['aurora_check_deps']({
      preload_models: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('spawn failed');
  });

  it('passes preload_models option to callMediaTool', async () => {
    mockCallMediaTool.mockResolvedValue({
      ok: true,
      title: '',
      text: '',
      metadata: { source_type: 'text', word_count: 0 },
    });

    await toolHandlers['aurora_check_deps']({ preload_models: true });

    expect(mockCallMediaTool).toHaveBeenCalledWith(
      'check_deps',
      { preload_models: true },
    );
  });
});
