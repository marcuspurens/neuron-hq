import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMemoryStats = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  memoryStats: (...args: unknown[]) => mockMemoryStats(...args),
}));

import { auroraMemoryStatsCommand } from '../../src/commands/aurora-memory-stats.js';

describe('aurora:memory-stats command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockMemoryStats.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows stats correctly', async () => {
    mockMemoryStats.mockResolvedValue({
      facts: 42,
      preferences: 8,
      total: 50,
      avgConfidence: 0.73,
      byScope: { personal: 35, shared: 10, project: 5 },
    });

    await auroraMemoryStatsCommand();

    const output = consoleOutput.join('\n');
    expect(output).toContain('Facts: 42');
    expect(output).toContain('Preferences: 8');
    expect(output).toContain('Total: 50');
    expect(output).toContain('0.73');
    expect(output).toContain('personal: 35');
    expect(output).toContain('shared: 10');
    expect(output).toContain('project: 5');
  });

  it('handles empty database', async () => {
    mockMemoryStats.mockResolvedValue({
      facts: 0,
      preferences: 0,
      total: 0,
      avgConfidence: 0,
      byScope: {},
    });

    await auroraMemoryStatsCommand();

    const output = consoleOutput.join('\n');
    expect(output).toContain('Facts: 0');
    expect(output).toContain('Total: 0');
  });

  it('shows error on failure', async () => {
    mockMemoryStats.mockRejectedValue(new Error('DB error'));

    await auroraMemoryStatsCommand();

    const errorOutput = consoleErrors.join('\n');
    expect(errorOutput).toContain('DB error');
  });
});
