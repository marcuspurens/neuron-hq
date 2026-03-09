import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetGaps = vi.fn();
vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: (...args: unknown[]) => mockGetGaps(...args),
}));

import { auroraGapsCommand } from '../../src/commands/aurora-gaps.js';

describe('aurora:gaps command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockGetGaps.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows knowledge gaps', async () => {
    mockGetGaps.mockResolvedValue({
      gaps: [
        { question: 'What is quantum physics?', askedAt: '2026-03-09T12:00:00.000Z', frequency: 3 },
        { question: 'How does Docker networking work?', askedAt: '2026-03-09T13:00:00.000Z', frequency: 1 },
      ],
      totalUnanswered: 2,
    });

    await auroraGapsCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Knowledge Gaps');
    expect(output).toContain('3x');
    expect(output).toContain('quantum physics');
    expect(output).toContain('1x');
    expect(output).toContain('Docker networking');
    expect(output).toContain('Total');
  });

  it('shows empty message when no gaps', async () => {
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });

    await auroraGapsCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('No knowledge gaps');
  });

  it('passes limit option', async () => {
    mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });

    await auroraGapsCommand({ limit: '5' });

    expect(mockGetGaps).toHaveBeenCalledWith(5);
  });

  it('shows error on failure', async () => {
    mockGetGaps.mockRejectedValue(new Error('DB unavailable'));

    await auroraGapsCommand({});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('DB unavailable');
  });
});
