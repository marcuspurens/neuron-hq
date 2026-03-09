import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUnifiedSearch = vi.fn();
vi.mock('../../src/aurora/cross-ref.js', () => ({
  unifiedSearch: (...args: unknown[]) => mockUnifiedSearch(...args),
}));

import { auroraCrossRefCommand } from '../../src/commands/aurora-cross-ref.js';

describe('aurora:cross-ref CLI command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows results from both graphs', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [
        {
          node: { id: 'p-1', title: 'Retry Pattern', type: 'pattern', confidence: 0.8 },
          source: 'neuron',
          similarity: 0.9,
        },
      ],
      auroraResults: [
        {
          node: { id: 'doc-1', title: 'Retry Research', type: 'document', confidence: 1.0 },
          source: 'aurora',
          similarity: 0.85,
        },
      ],
      crossRefs: [],
    });

    await auroraCrossRefCommand('retry', {});

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map(c => c.join(' ')).join('\n');
    expect(output).toContain('Retry Pattern');
    expect(output).toContain('Retry Research');
    expect(output).toContain('Cross-references found:');
  });

  it('passes --type filter to unifiedSearch', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });

    await auroraCrossRefCommand('test', { type: 'pattern' });

    expect(mockUnifiedSearch).toHaveBeenCalledWith('test', expect.objectContaining({
      type: 'pattern',
    }));
  });

  it('shows clear message when no results', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });

    await auroraCrossRefCommand('nothing', {});

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map(c => c.join(' ')).join('\n');
    expect(output).toContain('No results');
    expect(output).toContain('Cross-references found: 0');
  });

  it('handles errors gracefully', async () => {
    mockUnifiedSearch.mockRejectedValue(new Error('DB down'));

    await auroraCrossRefCommand('test', {});

    const errorOutput = (console.error as ReturnType<typeof vi.fn>).mock.calls
      .map(c => c.join(' ')).join('\n');
    expect(errorOutput).toContain('DB down');
  });

  it('passes --limit and --min-similarity options', async () => {
    mockUnifiedSearch.mockResolvedValue({
      neuronResults: [],
      auroraResults: [],
      crossRefs: [],
    });

    await auroraCrossRefCommand('test', { limit: '5', minSimilarity: '0.8' });

    expect(mockUnifiedSearch).toHaveBeenCalledWith('test', expect.objectContaining({
      limit: 5,
      minSimilarity: 0.8,
    }));
  });
});
