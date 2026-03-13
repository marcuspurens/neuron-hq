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
});
