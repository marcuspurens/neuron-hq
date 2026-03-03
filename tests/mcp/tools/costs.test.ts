import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockIsDbAvailable = vi.fn();
vi.mock('../../../src/core/db.js', () => ({
  getPool: vi
    .fn()
    .mockReturnValue({ query: (...args: unknown[]) => mockQuery(...args) }),
  isDbAvailable: () => mockIsDbAvailable(),
}));

import { registerCostsTool } from '../../../src/mcp/tools/costs.js';

const sampleRows = [
  {
    runid: '20260301-1200-test',
    target_name: 'test',
    status: 'green',
    started_at: '2026-03-01',
    model: 'claude-sonnet-4-6',
    total_input_tokens: 1000000,
    total_output_tokens: 100000,
    by_agent: {
      manager: { input_tokens: 500000, output_tokens: 50000 },
      implementer: { input_tokens: 500000, output_tokens: 50000 },
    },
  },
  {
    runid: '20260302-1200-test',
    target_name: 'test',
    status: 'red',
    started_at: '2026-03-02',
    model: 'claude-sonnet-4-6',
    total_input_tokens: 800000,
    total_output_tokens: 80000,
    by_agent: {
      manager: { input_tokens: 400000, output_tokens: 40000 },
    },
  },
];

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

describe('neuron_costs tool', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockIsDbAvailable.mockReset();
    registerCostsTool(mockServer);
  });

  it('registers with correct name', () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      'neuron_costs',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('returns cost summary', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: sampleRows });

    const result = await toolHandler({
      by_agent: false,
      summary_only: false,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.summary).toBeDefined();
    expect(data.summary.total_runs).toBe(2);
    expect(data.summary.total_cost).toBeGreaterThan(0);
    expect(data.summary.green_count).toBe(1);
  });

  it('summary_only excludes per-run data', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: sampleRows });

    const result = await toolHandler({
      summary_only: true,
      by_agent: false,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.summary).toBeDefined();
    expect(data.runs).toBeUndefined();
  });

  it('includes runs when not summary_only', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: sampleRows });

    const result = await toolHandler({
      summary_only: false,
      by_agent: false,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.runs).toHaveLength(2);
  });

  it('by_agent includes agent breakdown', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: sampleRows });

    const result = await toolHandler({
      by_agent: true,
      summary_only: false,
    });
    const data = JSON.parse(result.content[0].text);
    expect(data.agents).toBeDefined();
    expect(data.agents.length).toBeGreaterThan(0);
  });

  it('last limits query', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [sampleRows[0]] });

    await toolHandler({ last: 5, by_agent: false, summary_only: false });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain(5);
  });

  it('returns message when DB unavailable', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    const result = await toolHandler({
      by_agent: false,
      summary_only: false,
    });
    expect(result.content[0].text).toContain('Database not available');
  });
});
