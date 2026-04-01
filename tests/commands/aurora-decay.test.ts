import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockIsDbAvailable = vi.fn();
const mockClosePool = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
  isDbAvailable: () => mockIsDbAvailable(),
  closePool: () => mockClosePool(),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { auroraDecayCommand } from '../../src/commands/aurora-decay.js';

describe('aurora:decay command', () => {
  let consoleOutput: string[];

  beforeEach(() => {
    mockQuery.mockReset();
    mockIsDbAvailable.mockReset();
    mockClosePool.mockReset();
    consoleOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows DB unavailable message when no DB', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    await auroraDecayCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Database not available');
  });

  it('dry-run shows affected count without changing data', async () => {
    mockIsDbAvailable.mockResolvedValue(true);

    // Query 1: snapshot SELECT
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', title: 'Node 1', type: 'idea', confidence: 0.8 },
        { id: 'n2', title: 'Node 2', type: 'fact', confidence: 0.7 },
        { id: 'n3', title: 'Node 3', type: 'idea', confidence: 0.6 },
      ],
    });
    // Query 2: INSERT aurora_node (saveDecayAuroraNode)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await auroraDecayCommand({ dryRun: true });

    const output = consoleOutput.join('\n');
    expect(output).toContain('DRY RUN');
    expect(output).toContain('Nodes affected: 3');
    expect(output).toContain('Decay factor: 0.9');
    expect(output).toContain('Inactive threshold: 20 days');
    // Should NOT have called decay_confidence
    const decayCalls = mockQuery.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('decay_confidence')
    );
    expect(decayCalls).toHaveLength(0);
  });

  it('real run calls decay_confidence and shows results', async () => {
    mockIsDbAvailable.mockResolvedValue(true);

    // Query 1: snapshot SELECT
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', title: 'Node 1', type: 'idea', confidence: 0.8 },
        { id: 'n2', title: 'Node 2', type: 'fact', confidence: 0.6 },
      ],
    });
    // Query 2: decay_confidence
    mockQuery.mockResolvedValueOnce({
      rows: [{ updated_count: 5, avg_before: 0.7, avg_after: 0.63 }],
    });
    // Query 3: after-values SELECT
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'n1', title: 'Node 1', type: 'idea', confidence: 0.72 },
        { id: 'n2', title: 'Node 2', type: 'fact', confidence: 0.54 },
      ],
    });
    // Query 4: INSERT aurora_node
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await auroraDecayCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Nodes affected: 5');
    expect(output).toContain('Avg confidence: 0.70 → 0.63');
    expect(output).toContain('Decay factor: 0.9');
    expect(output).toContain('Inactive threshold: 20 days');
  });

  it('respects --days and --factor parameters', async () => {
    mockIsDbAvailable.mockResolvedValue(true);

    // Query 1: snapshot SELECT
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'n1', title: 'Node 1', type: 'idea', confidence: 0.9 }],
    });
    // Query 2: decay_confidence
    mockQuery.mockResolvedValueOnce({
      rows: [{ updated_count: 2, avg_before: 0.8, avg_after: 0.68 }],
    });
    // Query 3: after-values SELECT
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'n1', title: 'Node 1', type: 'idea', confidence: 0.765 }],
    });
    // Query 4: INSERT aurora_node
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await auroraDecayCommand({ days: '30', factor: '0.85' });

    const output = consoleOutput.join('\n');
    expect(output).toContain('Decay factor: 0.85');
    expect(output).toContain('Inactive threshold: 30 days');
    // Check that decay_confidence was called with correct params
    const decayCalls = mockQuery.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' && (call[0] as string).includes('decay_confidence')
    );
    expect(decayCalls).toHaveLength(1);
    expect(decayCalls[0]).toEqual([
      'SELECT * FROM decay_confidence($1, $2, $3)',
      ['aurora_nodes', 30, 0.85],
    ]);
  });

  it('shows heading', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    await auroraDecayCommand({});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Aurora Confidence Decay');
  });
});
