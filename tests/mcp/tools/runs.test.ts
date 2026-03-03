import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockIsDbAvailable = vi.fn();
vi.mock('../../../src/core/db.js', () => ({
  getPool: vi
    .fn()
    .mockReturnValue({ query: (...args: unknown[]) => mockQuery(...args) }),
  isDbAvailable: () => mockIsDbAvailable(),
}));

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    default: {
      ...actual,
      readdir: vi.fn(),
      readFile: vi.fn(),
    },
  };
});

import { registerRunsTool } from '../../../src/mcp/tools/runs.js';

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

describe('neuron_runs tool', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIsDbAvailable.mockReset();
    registerRunsTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_runs',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns runs from DB', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({
      rows: [
        {
          runid: '20260301-1200-test',
          target_name: 'test',
          status: 'green',
          started_at: '2026-03-01',
          completed_at: '2026-03-01',
          model: 'claude-sonnet-4-6',
          total_input_tokens: 1000000,
          total_output_tokens: 100000,
        },
      ],
    });

    const result = await toolHandler({ last: 10 });
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].runid).toBe('20260301-1200-test');
    expect(data[0].cost).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [] });

    await toolHandler({ status: 'green', last: 10 });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('r.status = $');
  });

  it('filters by target', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [] });

    await toolHandler({ target: 'neuron-hq', last: 10 });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('r.target_name = $');
  });

  it('returns detail for specific runid', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({
      rows: [
        {
          runid: '20260301-1200-test',
          target_name: 'test',
          status: 'green',
          started_at: '2026-03-01',
          completed_at: '2026-03-01',
          model: 'claude-sonnet-4-6',
          total_input_tokens: 500000,
          total_output_tokens: 50000,
          by_agent: { manager: { input_tokens: 250000, output_tokens: 25000 } },
        },
      ],
    });

    const result = await toolHandler({ runid: '20260301-1200-test', last: 10 });
    const data = JSON.parse(result.content[0].text);
    expect(data.runid).toBe('20260301-1200-test');
    expect(data.by_agent).toBeDefined();
  });

  it('returns error info on failure', async () => {
    mockIsDbAvailable.mockRejectedValue(new Error('DB error'));

    const result = await toolHandler({ last: 10 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });
});
