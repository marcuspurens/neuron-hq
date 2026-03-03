import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockGetTarget = vi.fn();
vi.mock('../../../src/core/targets.js', () => ({
  TargetsManager: vi.fn().mockImplementation(() => ({
    getTarget: (name: string) => mockGetTarget(name),
  })),
}));

import { registerStartTool } from '../../../src/mcp/tools/start.js';

type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

let toolHandler: ToolHandler;
const mockServer = {
  tool: vi.fn(
    (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      toolHandler = handler;
    },
  ),
} as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

describe('neuron_start tool', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockGetTarget.mockReset();
    mockSpawn.mockReturnValue({ pid: 12345, unref: vi.fn() });
    mockGetTarget.mockResolvedValue({ name: 'test-target', path: '/tmp/test' });
    registerStartTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_start',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns preview without confirm', async () => {
    const result = await toolHandler({
      target: 'test-target',
      brief: 'briefs/test.md',
      hours: 1,
      confirm: false,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.message).toContain('preview');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('rejects invalid target', async () => {
    mockGetTarget.mockResolvedValue(undefined);
    const result = await toolHandler({
      target: 'nonexistent',
      brief: 'briefs/test.md',
      hours: 1,
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('rejects brief outside briefs/', async () => {
    const result = await toolHandler({
      target: 'test-target',
      brief: '../../../etc/passwd',
      hours: 1,
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('briefs/');
  });

  it('rejects hours > 4', async () => {
    const result = await toolHandler({
      target: 'test-target',
      brief: 'briefs/test.md',
      hours: 5,
      confirm: true,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Maximum hours');
  });

  it('spawns process with confirm: true', async () => {
    const result = await toolHandler({
      target: 'test-target',
      brief: 'briefs/test.md',
      hours: 1,
      confirm: true,
    });
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const data = JSON.parse(result.content[0].text);
    expect(data.message).toContain('started');
    expect(data.pid).toBe(12345);
  });

  it('passes model override to spawn', async () => {
    await toolHandler({
      target: 'test-target',
      brief: 'briefs/test.md',
      hours: 1,
      model: 'claude-opus-4',
      confirm: true,
    });
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(spawnArgs).toContain('--model');
    expect(spawnArgs).toContain('claude-opus-4');
  });

  it('spawns detached process', async () => {
    await toolHandler({
      target: 'test-target',
      brief: 'briefs/test.md',
      hours: 1,
      confirm: true,
    });
    const spawnOpts = mockSpawn.mock.calls[0][2] as Record<string, unknown>;
    expect(spawnOpts.detached).toBe(true);
    expect(spawnOpts.stdio).toBe('ignore');
  });
});
