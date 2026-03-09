import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock freshness module
const mockVerifySource = vi.fn();
const mockGetFreshnessReport = vi.fn();
vi.mock('../../src/aurora/freshness.js', () => ({
  verifySource: (...args: unknown[]) => mockVerifySource(...args),
  getFreshnessReport: (...args: unknown[]) => mockGetFreshnessReport(...args),
}));

// Mock DB
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(true),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

import { auroraVerifyCommand } from '../../src/commands/aurora-verify.js';
import { auroraFreshnessCommand } from '../../src/commands/aurora-freshness.js';

describe('auroraVerifyCommand', () => {
  beforeEach(() => {
    mockVerifySource.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows confirmation for valid node', async () => {
    mockVerifySource.mockResolvedValue(true);
    await auroraVerifyCommand('node-123');
    expect(mockVerifySource).toHaveBeenCalledWith('node-123');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('marked as verified'));
  });

  it('shows error for unknown node', async () => {
    mockVerifySource.mockResolvedValue(false);
    await auroraVerifyCommand('unknown-id');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});

describe('auroraFreshnessCommand', () => {
  beforeEach(() => {
    mockGetFreshnessReport.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('shows freshness report', async () => {
    mockGetFreshnessReport.mockResolvedValue([
      {
        nodeId: 'n1', title: 'Test Node', type: 'fact',
        confidence: 0.8, lastVerified: null, daysSinceVerified: null,
        freshnessScore: 0, status: 'unverified',
      },
    ]);
    await auroraFreshnessCommand({});
    expect(mockGetFreshnessReport).toHaveBeenCalledWith({
      onlyStale: false,
      limit: 20,
    });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Total: 1'));
  });

  it('passes --stale flag to report', async () => {
    mockGetFreshnessReport.mockResolvedValue([]);
    await auroraFreshnessCommand({ stale: true });
    expect(mockGetFreshnessReport).toHaveBeenCalledWith({
      onlyStale: true,
      limit: 20,
    });
  });

  it('shows all fresh message when no results', async () => {
    mockGetFreshnessReport.mockResolvedValue([]);
    await auroraFreshnessCommand({});
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('All sources are fresh'));
  });
});
