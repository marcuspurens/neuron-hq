import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ---- Mock neuron-help module to avoid Anthropic dependency ---- */
const mockFindTools = vi.fn();
const mockListAll = vi.fn();
vi.mock('../../src/mcp/tools/neuron-help.js', () => ({
  findTools: (...args: unknown[]) => mockFindTools(...args),
  listAllToolsByCategory: () => mockListAll(),
}));

import { helpToolsCommand } from '../../src/commands/help-tools.js';

describe('helpToolsCommand', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockFindTools.mockReset();
    mockListAll.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('with question returns formatted result', async () => {
    mockFindTools.mockResolvedValue([
      {
        name: 'aurora_ingest_video',
        category: 'ingest-media',
        reason: 'Indexerar video',
        exampleCli: 'npx tsx src/cli.ts aurora:ingest-video https://example.com',
      },
    ]);

    await helpToolsCommand('indexera video', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('aurora_ingest_video');
    expect(output).toContain('ingest-media');
  });

  it('without argument lists all tools per category', async () => {
    mockListAll.mockReturnValue('\n## sökning\n  aurora_search — Sök i Aurora');

    await helpToolsCommand(undefined, {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('📚 Alla Neuron HQ-verktyg');
    expect(output).toContain('sökning');
  });

  it('result includes example calls', async () => {
    mockFindTools.mockResolvedValue([
      {
        name: 'aurora_search',
        category: 'sökning',
        reason: 'Sök i Aurora',
        exampleMcp: '{ "query": "test" }',
        exampleCli: 'npx tsx src/cli.ts aurora:ask "test"',
      },
    ]);

    await helpToolsCommand('sök', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('MCP:');
    expect(output).toContain('CLI:');
  });

  it('exit code 0 (no thrown error)', async () => {
    mockFindTools.mockResolvedValue([
      { name: 'aurora_search', category: 'sökning', reason: 'Test' },
    ]);

    await expect(helpToolsCommand('test', {})).resolves.toBeUndefined();
  });
});
