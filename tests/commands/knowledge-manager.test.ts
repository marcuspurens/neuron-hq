import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
vi.mock('../../src/core/agents/knowledge-manager.js', () => ({
  KnowledgeManagerAgent: vi.fn().mockImplementation(() => ({ run: mockRun })),
}));

import { knowledgeManagerCommand } from '../../src/commands/knowledge-manager.js';
import { KnowledgeManagerAgent } from '../../src/core/agents/knowledge-manager.js';

describe('km CLI command', () => {
  beforeEach(() => {
    mockRun.mockReset();
    (KnowledgeManagerAgent as unknown as ReturnType<typeof vi.fn>).mockClear();
    mockRun.mockResolvedValue({
      gapsFound: 3,
      gapsResearched: 2,
      sourcesRefreshed: 1,
      newNodesCreated: 4,
      summary: 'Test summary',
    });
  });

  it('runs with default options', async () => {
    await knowledgeManagerCommand({});
    expect(KnowledgeManagerAgent).toHaveBeenCalledTimes(1);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('passes topic option', async () => {
    await knowledgeManagerCommand({ topic: 'AI safety' });
    const constructorCall = (KnowledgeManagerAgent as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(constructorCall[1].focusTopic).toBe('AI safety');
  });

  it('parses max-actions as number', async () => {
    await knowledgeManagerCommand({ maxActions: '10' });
    const constructorCall = (KnowledgeManagerAgent as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(constructorCall[1].maxActions).toBe(10);
  });

  it('passes stale=false when --no-stale', async () => {
    await knowledgeManagerCommand({ stale: false });
    const constructorCall = (KnowledgeManagerAgent as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(constructorCall[1].includeStale).toBe(false);
  });

  it('handles errors without crashing', async () => {
    mockRun.mockRejectedValue(new Error('DB down'));
    await expect(knowledgeManagerCommand({})).resolves.not.toThrow();
  });

  it('passes chain-compatible options through to agent', async () => {
    // Simulate the scenario where chain options are added to cmd options
    // Currently the command only passes known fields; verify no errors with extra fields
    await knowledgeManagerCommand({ topic: 'AI', maxActions: '5', stale: true });
    const constructorCall = (KnowledgeManagerAgent as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(constructorCall[1].focusTopic).toBe('AI');
    expect(constructorCall[1].maxActions).toBe(5);
    expect(constructorCall[1].includeStale).toBe(true);
  });

  it('outputs chain info when report contains chain fields', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRun.mockResolvedValue({
      gapsFound: 5,
      gapsResearched: 4,
      sourcesRefreshed: 2,
      newNodesCreated: 6,
      summary: 'Chain abc12345: 3 cycle(s), stopped by convergence.',
      chainId: 'abc12345-full-uuid',
      totalCycles: 3,
      stoppedBy: 'convergence',
      emergentGapsFound: 7,
    });

    await knowledgeManagerCommand({});

    // Verify the chain summary is printed via the report summary
    const allOutput = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allOutput).toContain('Chain');
    expect(allOutput).toContain('convergence');
    consoleSpy.mockRestore();
  });

  it('handles report with timeout stoppedBy gracefully', async () => {
    mockRun.mockResolvedValue({
      gapsFound: 2,
      gapsResearched: 1,
      sourcesRefreshed: 0,
      newNodesCreated: 1,
      summary: 'Chain xyz: 1 cycle(s), stopped by timeout.',
      chainId: 'xyz-uuid',
      stoppedBy: 'timeout',
    });

    await expect(knowledgeManagerCommand({})).resolves.not.toThrow();
  });
});
