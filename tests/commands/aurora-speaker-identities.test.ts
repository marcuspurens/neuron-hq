import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListSpeakerIdentities = vi.fn();
vi.mock('../../src/aurora/speaker-identity.js', () => ({
  listSpeakerIdentities: (...args: unknown[]) => mockListSpeakerIdentities(...args),
}));

vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
}));

import { auroraSpeakerIdentitiesCommand } from '../../src/commands/aurora-speaker-identities.js';

describe('auroraSpeakerIdentitiesCommand', () => {
  beforeEach(() => {
    mockListSpeakerIdentities.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('lists identities with confidence and counts', async () => {
    mockListSpeakerIdentities.mockResolvedValue([
      {
        id: 'speaker-marcus', displayName: 'Marcus', confidence: 0.90, confirmations: 5,
        autoTagThreshold: 0.90, confirmedVoicePrints: ['vp-1', 'vp-2', 'vp-3'],
      },
      {
        id: 'speaker-anna', displayName: 'Anna', confidence: 0.60, confirmations: 2,
        autoTagThreshold: 0.90, confirmedVoicePrints: ['vp-4'],
      },
    ]);

    await auroraSpeakerIdentitiesCommand();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Marcus'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Anna'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('0.90'));
  });

  it('shows empty message when none exist', async () => {
    mockListSpeakerIdentities.mockResolvedValue([]);

    await auroraSpeakerIdentitiesCommand();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No speaker identities'));
  });
});
