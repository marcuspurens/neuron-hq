import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CascadeDeleteResult } from '../../src/aurora/cascade-delete.js';

const mockCascadeDelete = vi.fn<(nodeId: string) => Promise<CascadeDeleteResult>>();
const mockIsDbAvailable = vi.fn<() => Promise<boolean>>();
const mockClosePool = vi.fn<() => Promise<void>>();

vi.mock('../../src/aurora/cascade-delete.js', () => ({
  cascadeDeleteAuroraNode: (...args: unknown[]) => mockCascadeDelete(...(args as [string])),
}));

vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: () => mockIsDbAvailable(),
  closePool: () => mockClosePool(),
}));

import { auroraDeleteCommand } from '../../src/commands/aurora-delete.js';

function makeResult(overrides: Partial<CascadeDeleteResult> = {}): CascadeDeleteResult {
  return {
    deleted: true,
    nodeId: 'test-node',
    chunksRemoved: 3,
    voicePrintsRemoved: 2,
    speakerIdentitiesRemoved: 1,
    crossRefsRemoved: 4,
    ...overrides,
  };
}

describe('aurora:delete command', () => {
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    logs = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    mockIsDbAvailable.mockResolvedValue(true);
    mockClosePool.mockResolvedValue(undefined);
  });

  it('prints error when db is unavailable', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    await auroraDeleteCommand('node-1');

    expect(logs.join('\n')).toContain('PostgreSQL not available');
    expect(mockCascadeDelete).not.toHaveBeenCalled();
  });

  it('does not call closePool when db is unavailable', async () => {
    mockIsDbAvailable.mockResolvedValue(false);

    await auroraDeleteCommand('node-1');

    expect(mockClosePool).not.toHaveBeenCalled();
  });

  it('prints success with counts on successful delete', async () => {
    mockCascadeDelete.mockResolvedValue(makeResult({ nodeId: 'vid-123' }));

    await auroraDeleteCommand('vid-123');

    const output = logs.join('\n');
    expect(output).toContain('Deleted: vid-123');
    expect(output).toContain('Chunks removed');
    expect(output).toContain('3');
    expect(output).toContain('Voice prints removed');
    expect(output).toContain('2');
    expect(output).toContain('Speaker identities removed');
    expect(output).toContain('1');
    expect(output).toContain('Cross-refs removed');
    expect(output).toContain('4');
  });

  it('prints not found when node does not exist', async () => {
    mockCascadeDelete.mockResolvedValue(
      makeResult({ deleted: false, nodeId: 'missing', reason: 'not_found' }),
    );

    await auroraDeleteCommand('missing');

    expect(logs.join('\n')).toContain('Node "missing" not found');
  });

  it('prints reason when delete fails for other reasons', async () => {
    mockCascadeDelete.mockResolvedValue(
      makeResult({ deleted: false, nodeId: 'x', reason: 'db_unavailable' }),
    );

    await auroraDeleteCommand('x');

    expect(logs.join('\n')).toContain('db_unavailable');
  });

  it('prints error when cascade delete throws', async () => {
    mockCascadeDelete.mockRejectedValue(new Error('transaction rollback'));

    await auroraDeleteCommand('node-1');

    expect(errors.join('\n')).toContain('transaction rollback');
  });

  it('always calls closePool when db is available', async () => {
    mockCascadeDelete.mockRejectedValue(new Error('boom'));

    await auroraDeleteCommand('node-1');

    expect(mockClosePool).toHaveBeenCalledOnce();
  });

  it('passes nodeId to cascadeDeleteAuroraNode', async () => {
    mockCascadeDelete.mockResolvedValue(makeResult());

    await auroraDeleteCommand('my-special-node');

    expect(mockCascadeDelete).toHaveBeenCalledWith('my-special-node');
  });
});
