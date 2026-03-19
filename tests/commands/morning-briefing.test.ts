import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the core module
vi.mock('../../src/aurora/morning-briefing.js', () => ({
  generateMorningBriefing: vi.fn().mockResolvedValue({
    markdown: '# Test',
    filePath: '/tmp/test/Briefings/briefing-2026-03-19.md',
    data: {
      date: '2026-03-19',
      periodStart: new Date('2026-03-18T08:00:00'),
      periodEnd: new Date('2026-03-19T08:00:00'),
      newNodes: [{ type: 'fact', count: 3 }],
      runs: [],
      newIdeas: [],
      staleSources: [],
      agingCount: 0,
      knowledgeGaps: [],
      questions: [],
    },
  }),
}));

vi.mock('../../src/core/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { morningBriefingCommand } from '../../src/commands/morning-briefing.js';
import { generateMorningBriefing } from '../../src/aurora/morning-briefing.js';

describe('morningBriefingCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls generateMorningBriefing with vault option', async () => {
    await morningBriefingCommand({ vault: '/my/vault' });
    expect(generateMorningBriefing).toHaveBeenCalledWith({
      vaultPath: '/my/vault',
      date: undefined,
      force: undefined,
    });
  });

  it('passes date and force options', async () => {
    await morningBriefingCommand({ vault: '/v', date: '2026-03-18', force: true });
    expect(generateMorningBriefing).toHaveBeenCalledWith({
      vaultPath: '/v',
      date: '2026-03-18',
      force: true,
    });
  });

  it('handles already-generated error gracefully', async () => {
    const mock = generateMorningBriefing as ReturnType<typeof vi.fn>;
    mock.mockRejectedValueOnce(new Error('Briefing redan genererad för idag'));
    // Should not throw
    await morningBriefingCommand({});
    expect(mock).toHaveBeenCalled();
  });
});
