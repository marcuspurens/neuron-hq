import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAsk = vi.fn();
vi.mock('../../src/aurora/ask.js', () => ({
  ask: (...args: unknown[]) => mockAsk(...args),
}));

import { auroraAskCommand } from '../../src/commands/aurora-ask.js';

describe('aurora:ask command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockAsk.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows answer and sources', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Neuron HQ is a knowledge system.',
      citations: [
        { nodeId: 'doc-1', title: 'README', type: 'document', similarity: 0.92 },
      ],
      sourcesUsed: 1,
      noSourcesFound: false,
    });

    await auroraAskCommand('What is Neuron HQ?', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Answer:');
    expect(output).toContain('Neuron HQ is a knowledge system.');
    expect(output).toContain('Sources:');
    expect(output).toContain('README');
  });

  it('shows no sources message', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Inga relevanta källor hittades.',
      citations: [],
      sourcesUsed: 0,
      noSourcesFound: true,
    });

    await auroraAskCommand('Unknown topic', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('No relevant sources');
  });

  it('passes --max-sources option', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Answer',
      citations: [],
      sourcesUsed: 0,
      noSourcesFound: true,
    });

    await auroraAskCommand('test', { maxSources: '5' });

    expect(mockAsk).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ maxSources: 5 }),
    );
  });

  it('shows error on failure', async () => {
    mockAsk.mockRejectedValue(new Error('Network error'));

    await auroraAskCommand('test', {});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('Network error');
  });

  it('passes type and scope options', async () => {
    mockAsk.mockResolvedValue({
      answer: 'Answer',
      citations: [],
      sourcesUsed: 0,
      noSourcesFound: true,
    });

    await auroraAskCommand('test', { type: 'fact', scope: 'shared' });

    expect(mockAsk).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ type: 'fact', scope: 'shared' }),
    );
  });
});
