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

import { auroraStatusCommand } from '../../src/commands/aurora-status.js';

describe('aurora:status command', () => {
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

  it('shows empty status when DB is not available', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    await auroraStatusCommand();

    const output = consoleOutput.join('\n');
    expect(output).toContain('Aurora Knowledge Graph');
    expect(output).toContain('0 nodes, 0 edges');
  });

  it('shows node and edge counts from DB', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ type: 'document', count: 5 }, { type: 'fact', count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ type: 'related_to', count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ with_embedding: 4, total: 8 }] })
      .mockResolvedValueOnce({ rows: [{ title: 'Latest Doc', created: '2026-03-01' }] })
      .mockResolvedValueOnce({ rows: [{ stale: 1, active: 6 }] });

    await auroraStatusCommand();

    const output = consoleOutput.join('\n');
    expect(output).toContain('8 nodes, 2 edges');
    expect(output).toContain('document: 5');
    expect(output).toContain('fact: 3');
    expect(output).toContain('related_to: 2');
    expect(output).toContain('4/8 nodes have embeddings');
    expect(output).toContain('Latest Doc');
    expect(output).toContain('Stale (< 0.1): 1');
    expect(output).toContain('Active (>= 0.5): 6');
  });

  it('handles empty database gracefully', async () => {
    mockIsDbAvailable.mockResolvedValue(true);
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ with_embedding: 0, total: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ stale: 0, active: 0 }] });

    await auroraStatusCommand();

    const output = consoleOutput.join('\n');
    expect(output).toContain('0 nodes, 0 edges');
    expect(output).toContain('0/0 nodes have embeddings');
  });

  it('calls closePool on completion', async () => {
    mockIsDbAvailable.mockResolvedValue(false);
    await auroraStatusCommand();
    expect(mockClosePool).toHaveBeenCalled();
  });
});
