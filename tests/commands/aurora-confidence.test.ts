import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bayesian-confidence module
const mockGetConfidenceHistory = vi.fn();
vi.mock('../../src/aurora/bayesian-confidence.js', () => ({
  getConfidenceHistory: (...args: unknown[]) => mockGetConfidenceHistory(...args),
}));

// Mock DB
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

import { auroraConfidenceCommand } from '../../src/commands/aurora-confidence.js';

describe('auroraConfidenceCommand', () => {
  beforeEach(() => {
    mockGetConfidenceHistory.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows confidence history for node', async () => {
    mockGetConfidenceHistory.mockResolvedValue([
      {
        id: 1,
        nodeId: 'doc_abc123',
        oldConfidence: 0.5,
        newConfidence: 0.5622,
        direction: 'supports',
        sourceType: 'academic',
        weight: 0.25,
        reason: 'Cross-ref with "Test" (similarity: 0.85)',
        metadata: {},
        timestamp: '2026-03-12T10:00:00.000Z',
      },
    ]);
    await auroraConfidenceCommand('doc_abc123', {});
    expect(mockGetConfidenceHistory).toHaveBeenCalledWith('doc_abc123', 20);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('doc_abc123'));
  });

  it('shows message when no history exists', async () => {
    mockGetConfidenceHistory.mockResolvedValue([]);
    await auroraConfidenceCommand('doc_xyz', {});
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No confidence updates'));
  });

  it('passes limit option', async () => {
    mockGetConfidenceHistory.mockResolvedValue([]);
    await auroraConfidenceCommand('doc_abc', { limit: '50' });
    expect(mockGetConfidenceHistory).toHaveBeenCalledWith('doc_abc', 50);
  });
});
