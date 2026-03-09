import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRecall = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  recall: (...args: unknown[]) => mockRecall(...args),
}));

import { auroraRecallCommand } from '../../src/commands/aurora-recall.js';

describe('aurora:recall command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockRecall.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows memories with confidence', async () => {
    mockRecall.mockResolvedValue({
      memories: [
        {
          id: 'mem-1',
          title: 'TypeScript is great',
          type: 'fact',
          text: 'TypeScript is great',
          confidence: 0.9,
          scope: 'personal',
          tags: [],
          similarity: 0.85,
          related: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      totalFound: 1,
    });

    await auroraRecallCommand('typescript', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('TypeScript is great');
    expect(output).toContain('confidence: 0.9');
    expect(output).toContain('Found 1 memories');
  });

  it('--type filters correctly', async () => {
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });

    await auroraRecallCommand('test', { type: 'preference' });

    expect(mockRecall).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ type: 'preference' }),
    );
  });

  it('--limit restricts results', async () => {
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });

    await auroraRecallCommand('test', { limit: '5' });

    expect(mockRecall).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('shows clear message for empty results', async () => {
    mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });

    await auroraRecallCommand('nonexistent', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('No memories found');
  });

  it('shows error on failure', async () => {
    mockRecall.mockRejectedValue(new Error('Search failed'));

    await auroraRecallCommand('test', {});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('Search failed');
  });
});
