import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRemember = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  remember: (...args: unknown[]) => mockRemember(...args),
}));

import { auroraRememberCommand } from '../../src/commands/aurora-remember.js';

describe('aurora:remember command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockRemember.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows "Created" for new memory', async () => {
    mockRemember.mockResolvedValue({
      action: 'created',
      nodeId: 'abc123',
    });

    await auroraRememberCommand('Test fact', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Created new memory');
    expect(output).toContain('abc123');
  });

  it('shows "Updated" for dedup match', async () => {
    mockRemember.mockResolvedValue({
      action: 'updated',
      nodeId: 'existing-1',
      existingNodeId: 'existing-1',
      similarity: 0.91,
    });

    await auroraRememberCommand('Updated fact', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Updated existing memory');
    expect(output).toContain('0.91');
  });

  it('--type preference sets correct type', async () => {
    mockRemember.mockResolvedValue({ action: 'created', nodeId: 'p1' });

    await auroraRememberCommand('I prefer TS', { type: 'preference' });

    expect(mockRemember).toHaveBeenCalledWith(
      'I prefer TS',
      expect.objectContaining({ type: 'preference' }),
    );
  });

  it('--tags are parsed correctly', async () => {
    mockRemember.mockResolvedValue({ action: 'created', nodeId: 't1' });

    await auroraRememberCommand('Tagged fact', { tags: 'ts, dev, tools' });

    expect(mockRemember).toHaveBeenCalledWith(
      'Tagged fact',
      expect.objectContaining({ tags: ['ts', 'dev', 'tools'] }),
    );
  });

  it('shows error on failure', async () => {
    mockRemember.mockRejectedValue(new Error('Save failed'));

    await auroraRememberCommand('Broken', {});

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('Save failed');
  });

  it('shows duplicate message', async () => {
    mockRemember.mockResolvedValue({
      action: 'duplicate',
      nodeId: 'dup-1',
      existingNodeId: 'dup-1',
      similarity: 0.97,
    });

    await auroraRememberCommand('Duplicate fact', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Duplicate');
  });
});
