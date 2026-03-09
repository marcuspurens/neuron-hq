import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockCheckCrossRefIntegrity = vi.fn();
vi.mock('../../src/aurora/cross-ref.js', () => ({
  checkCrossRefIntegrity: (...args: unknown[]) => mockCheckCrossRefIntegrity(...args),
}));

const mockIsDbAvailable = vi.fn();
const mockClosePool = vi.fn();
vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: () => mockIsDbAvailable(),
  closePool: () => mockClosePool(),
}));

import { auroraIntegrityCommand } from '../../src/commands/aurora-integrity.js';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('auroraIntegrityCommand', () => {
  beforeEach(() => {
    mockCheckCrossRefIntegrity.mockReset();
    mockIsDbAvailable.mockReset();
    mockClosePool.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('exits early when DB is not available', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    await auroraIntegrityCommand({});

    expect(mockCheckCrossRefIntegrity).not.toHaveBeenCalled();
    expect(mockClosePool).not.toHaveBeenCalled();
  });

  it('reports healthy when no issues found', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockCheckCrossRefIntegrity.mockResolvedValue([]);
    mockClosePool.mockResolvedValue(undefined);

    await auroraIntegrityCommand({});

    expect(mockCheckCrossRefIntegrity).toHaveBeenCalledWith({
      confidenceThreshold: 0.5,
      limit: 20,
    });
    expect(mockClosePool).toHaveBeenCalled();
  });

  it('lists issues when found', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockCheckCrossRefIntegrity.mockResolvedValue([
      {
        crossRefId: 1,
        neuronNodeId: 'n1',
        neuronTitle: 'Weak Node',
        neuronConfidence: 0.3,
        auroraNodeId: 'a1',
        auroraTitle: 'Aurora Doc',
        issue: 'low_confidence',
      },
    ]);
    mockClosePool.mockResolvedValue(undefined);

    await auroraIntegrityCommand({ threshold: '0.6', limit: '10' });

    expect(mockCheckCrossRefIntegrity).toHaveBeenCalledWith({
      confidenceThreshold: 0.6,
      limit: 10,
    });
    expect(mockClosePool).toHaveBeenCalled();
  });

  it('uses default threshold and limit when not provided', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockCheckCrossRefIntegrity.mockResolvedValue([]);
    mockClosePool.mockResolvedValue(undefined);

    await auroraIntegrityCommand({});

    expect(mockCheckCrossRefIntegrity).toHaveBeenCalledWith({
      confidenceThreshold: 0.5,
      limit: 20,
    });
  });
});
