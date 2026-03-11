import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateSpeakerIdentity = vi.fn();
const mockConfirmSpeaker = vi.fn();
const mockListSpeakerIdentities = vi.fn();
vi.mock('../../src/aurora/speaker-identity.js', () => ({
  createSpeakerIdentity: (...args: unknown[]) => mockCreateSpeakerIdentity(...args),
  confirmSpeaker: (...args: unknown[]) => mockConfirmSpeaker(...args),
  listSpeakerIdentities: (...args: unknown[]) => mockListSpeakerIdentities(...args),
}));

vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([]),
}));

import { auroraConfirmSpeakerCommand } from '../../src/commands/aurora-confirm-speaker.js';

describe('auroraConfirmSpeakerCommand', () => {
  beforeEach(() => {
    mockCreateSpeakerIdentity.mockReset();
    mockConfirmSpeaker.mockReset();
    mockListSpeakerIdentities.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows confirmation with updated confidence', async () => {
    mockListSpeakerIdentities.mockResolvedValue([
      { id: 'speaker-marcus', name: 'Marcus', confidence: 0.6, confirmations: 2, autoTagThreshold: 0.90, confirmedVoicePrints: ['vp-1'] },
    ]);
    mockConfirmSpeaker.mockResolvedValue({
      identity: { id: 'speaker-marcus', name: 'Marcus', confidence: 0.7, confirmations: 3, autoTagThreshold: 0.90, confirmedVoicePrints: ['vp-1', 'vp-2'] },
      newConfidence: 0.7,
    });

    await auroraConfirmSpeakerCommand('vp-2', 'Marcus');

    expect(mockConfirmSpeaker).toHaveBeenCalledWith('speaker-marcus', 'vp-2');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Confirmed'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Marcus'));
  });

  it('creates new identity on first confirmation', async () => {
    mockListSpeakerIdentities.mockResolvedValue([]);
    mockCreateSpeakerIdentity.mockResolvedValue({
      id: 'speaker-anna', name: 'Anna', confidence: 0.5, confirmations: 1, autoTagThreshold: 0.90, confirmedVoicePrints: ['vp-3'],
      created: new Date().toISOString(), updated: new Date().toISOString(), metadata: {},
    });

    await auroraConfirmSpeakerCommand('vp-3', 'Anna');

    expect(mockCreateSpeakerIdentity).toHaveBeenCalledWith('Anna', 'vp-3');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Confirmed'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('new'));
  });

  it('shows auto-tag status', async () => {
    mockListSpeakerIdentities.mockResolvedValue([
      { id: 'speaker-marcus', name: 'Marcus', confidence: 0.9, confirmations: 5, autoTagThreshold: 0.90, confirmedVoicePrints: [] },
    ]);
    mockConfirmSpeaker.mockResolvedValue({
      identity: { id: 'speaker-marcus', name: 'Marcus', confidence: 0.95, confirmations: 6, autoTagThreshold: 0.90, confirmedVoicePrints: [] },
      newConfidence: 0.95,
    });

    await auroraConfirmSpeakerCommand('vp-5', 'Marcus');

    // Should show the checkmark for auto-tag since 0.95 >= 0.90
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅'));
  });
});
