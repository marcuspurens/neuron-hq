import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockRenameSpeaker = vi.fn();
vi.mock('../../src/aurora/voiceprint.js', () => ({
  renameSpeaker: (...args: unknown[]) => mockRenameSpeaker(...args),
}));

// Mock DB and embeddings (transitive deps of aurora-graph)
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
}));

import { auroraRenameSpeakerCommand } from '../../src/commands/aurora-rename-speaker.js';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('auroraRenameSpeakerCommand', () => {
  beforeEach(() => {
    mockRenameSpeaker.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows success message with old and new name', async () => {
    mockRenameSpeaker.mockResolvedValue({
      oldName: 'SPEAKER_1',
      newName: 'Marcus',
      voicePrintId: 'vp-123',
    });

    await auroraRenameSpeakerCommand('vp-123', 'Marcus');

    expect(mockRenameSpeaker).toHaveBeenCalledWith('vp-123', 'Marcus');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Renamed'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('SPEAKER_1'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Marcus'));
  });

  it('shows error for non-existent voice print', async () => {
    mockRenameSpeaker.mockRejectedValue(new Error('Voice print not found: vp-999'));

    await auroraRenameSpeakerCommand('vp-999', 'Nobody');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error'));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Voice print not found'),
    );
  });
});
