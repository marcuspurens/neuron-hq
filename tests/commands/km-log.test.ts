import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock km-log module
vi.mock('../../src/aurora/km-log.js', () => ({
  logKMRun: vi.fn(),
  getKMRunHistory: vi.fn(),
  getLastAutoKMRunNumber: vi.fn(),
}));

// Mock knowledge-manager agent
vi.mock('../../src/core/agents/knowledge-manager.js', () => ({
  KnowledgeManagerAgent: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({
      gapsFound: 2,
      gapsResearched: 1,
      gapsResolved: 0,
      urlsIngested: 3,
      factsLearned: 2,
      sourcesRefreshed: 1,
      newNodesCreated: 1,
      summary: 'Test summary',
      details: [],
    }),
  })),
}));

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: (s: string) => s,
    red: (s: string) => s,
  },
}));

import { logKMRun } from '../../src/aurora/km-log.js';
import { knowledgeManagerCommand } from '../../src/commands/knowledge-manager.js';

const mockLogKMRun = vi.mocked(logKMRun);

describe('Knowledge Manager CLI trigger tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogKMRun.mockResolvedValue(1);
  });

  it('calls logKMRun with trigger manual-cli', async () => {
    await knowledgeManagerCommand({ topic: 'AI' });
    expect(mockLogKMRun).toHaveBeenCalledTimes(1);
    expect(mockLogKMRun).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'manual-cli',
        topic: 'AI',
      }),
    );
  });

  it('passes report and durationMs to logKMRun', async () => {
    await knowledgeManagerCommand({});
    const call = mockLogKMRun.mock.calls[0][0];
    expect(call.report).toBeDefined();
    expect(call.report.gapsFound).toBe(2);
    expect(typeof call.durationMs).toBe('number');
    expect(call.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('does not crash if logKMRun throws', async () => {
    mockLogKMRun.mockRejectedValue(new Error('DB down'));
    // Should not throw
    await expect(knowledgeManagerCommand({})).resolves.toBeUndefined();
  });

  it('passes undefined topic when not specified', async () => {
    await knowledgeManagerCommand({});
    const call = mockLogKMRun.mock.calls[0][0];
    expect(call.topic).toBeUndefined();
  });
});
