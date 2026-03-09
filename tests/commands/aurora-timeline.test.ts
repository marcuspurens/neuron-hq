import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTimeline = vi.fn();
vi.mock('../../src/aurora/timeline.js', () => ({
  timeline: (...args: unknown[]) => mockTimeline(...args),
}));

import { auroraTimelineCommand } from '../../src/commands/aurora-timeline.js';

describe('aurora:timeline command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockTimeline.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows timeline entries', async () => {
    mockTimeline.mockResolvedValue([
      {
        id: 'n1',
        title: 'TypeScript har strict mode',
        type: 'fact',
        createdAt: '2026-03-09T12:30:00.000Z',
        scope: 'personal',
        confidence: 0.9,
      },
    ]);

    await auroraTimelineCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Timeline');
    expect(output).toContain('TypeScript har strict mode');
    expect(output).toContain('fact');
  });

  it('shows empty message when no entries', async () => {
    mockTimeline.mockResolvedValue([]);

    await auroraTimelineCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('No entries found');
  });

  it('passes --type filter', async () => {
    mockTimeline.mockResolvedValue([]);

    await auroraTimelineCommand({ type: 'fact' });

    expect(mockTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fact' }),
    );
  });

  it('passes --since filter', async () => {
    mockTimeline.mockResolvedValue([]);

    await auroraTimelineCommand({ since: '2026-03-01' });

    expect(mockTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ since: '2026-03-01' }),
    );
  });

  it('passes --limit option', async () => {
    mockTimeline.mockResolvedValue([]);

    await auroraTimelineCommand({ limit: '10' });

    expect(mockTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('shows source when present', async () => {
    mockTimeline.mockResolvedValue([
      {
        id: 'n1',
        title: 'README',
        type: 'document',
        createdAt: '2026-03-09T11:00:00.000Z',
        scope: 'personal',
        confidence: 1.0,
        source: 'https://example.com/readme',
      },
    ]);

    await auroraTimelineCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('https://example.com/readme');
  });

  it('shows error on failure', async () => {
    mockTimeline.mockRejectedValue(new Error('Load failed'));

    await auroraTimelineCommand({});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('Load failed');
  });
});
