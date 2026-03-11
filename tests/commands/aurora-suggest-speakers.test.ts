import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockSuggestSpeakerMatches = vi.fn();
vi.mock('../../src/aurora/voiceprint.js', () => ({
  suggestSpeakerMatches: (...args: unknown[]) =>
    mockSuggestSpeakerMatches(...args),
}));

// Mock DB and embeddings (transitive deps of aurora-graph)
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
}));

import { auroraSuggestSpeakersCommand } from '../../src/commands/aurora-suggest-speakers.js';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('auroraSuggestSpeakersCommand', () => {
  beforeEach(() => {
    mockSuggestSpeakerMatches.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows matches sorted by similarity', async () => {
    mockSuggestSpeakerMatches.mockResolvedValue([
      {
        sourceId: 'vp-1',
        sourceName: 'Speaker: Marcus',
        matchId: 'vp-3',
        matchName: 'Speaker: Marcus',
        sourceVideo: 'vid-a',
        matchVideo: 'vid-b',
        similarity: 0.95,
        reason: 'Same name: Marcus',
      },
      {
        sourceId: 'vp-2',
        sourceName: 'Speaker: SPEAKER_1',
        matchId: 'vp-4',
        matchName: 'Speaker: SPEAKER_1',
        sourceVideo: 'vid-a',
        matchVideo: 'vid-c',
        similarity: 0.5,
        reason: 'Same auto-label: SPEAKER_1',
      },
    ]);

    await auroraSuggestSpeakersCommand({});

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Marcus'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('SPEAKER_1'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('0.95'),
    );
  });

  it('shows "no matches" message when none found', async () => {
    mockSuggestSpeakerMatches.mockResolvedValue([]);

    await auroraSuggestSpeakersCommand({});

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('No matches'),
    );
  });

  it('respects --threshold option', async () => {
    mockSuggestSpeakerMatches.mockResolvedValue([]);

    await auroraSuggestSpeakersCommand({ threshold: 0.5 });

    expect(mockSuggestSpeakerMatches).toHaveBeenCalledWith({
      threshold: 0.5,
    });
  });
});
