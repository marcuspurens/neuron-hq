import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockMergeSpeakers = vi.fn();
vi.mock('../../src/aurora/voiceprint.js', () => ({
  mergeSpeakers: (...args: unknown[]) => mockMergeSpeakers(...args),
}));

// Mock DB and embeddings (transitive deps of aurora-graph)
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
}));

import { auroraMergeSpeakersCommand } from '../../src/commands/aurora-merge-speakers.js';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('auroraMergeSpeakersCommand', () => {
  beforeEach(() => {
    mockMergeSpeakers.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows merge confirmation with segment counts', async () => {
    mockMergeSpeakers.mockResolvedValue({
      merged: true,
      targetId: 'vp-2',
      targetName: 'Marcus',
      sourceSegments: 12,
      totalSegments: 28,
    });

    await auroraMergeSpeakersCommand('vp-1', 'vp-2');

    expect(mockMergeSpeakers).toHaveBeenCalledWith('vp-1', 'vp-2');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Merged'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Marcus'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('12'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('28'));
  });

  it('shows error when merging same speaker', async () => {
    mockMergeSpeakers.mockRejectedValue(
      new Error('Cannot merge a speaker with itself'),
    );

    await auroraMergeSpeakersCommand('vp-1', 'vp-1');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error'));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Cannot merge a speaker with itself'),
    );
  });
});
