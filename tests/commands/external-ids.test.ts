import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLookupExternalIds = vi.fn();
const mockBackfillExternalIds = vi.fn();
vi.mock('../../src/aurora/external-ids.js', () => ({
  lookupExternalIds: (...args: unknown[]) => mockLookupExternalIds(...args),
  backfillExternalIds: (...args: unknown[]) => mockBackfillExternalIds(...args),
}));

const mockListConcepts = vi.fn();
vi.mock('../../src/aurora/ontology.js', () => ({
  listConcepts: (...args: unknown[]) => mockListConcepts(...args),
  getConceptTree: vi.fn().mockResolvedValue([]),
  getOntologyStats: vi.fn().mockResolvedValue({}),
  suggestMerges: vi.fn().mockResolvedValue([]),
}));

import { libraryLookupCommand, libraryBackfillIdsCommand } from '../../src/commands/knowledge-library.js';

describe('libraryLookupCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockListConcepts.mockResolvedValue([]);
  });

  it('displays external IDs when found', async () => {
    mockLookupExternalIds.mockResolvedValue({
      wikidata: 'Q2539',
      wikidataLabel: 'Machine Learning',
      wikidataDescription: 'branch of artificial intelligence',
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await libraryLookupCommand('Machine Learning');
    expect(mockLookupExternalIds).toHaveBeenCalled();
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Q2539');
    spy.mockRestore();
  });

  it('shows no results message when nothing found', async () => {
    mockLookupExternalIds.mockResolvedValue({});
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await libraryLookupCommand('NonExistentConcept');
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('No external IDs found');
    spy.mockRestore();
  });

  it('uses concept facet when concept exists', async () => {
    mockListConcepts.mockResolvedValue([{
      title: 'Machine Learning',
      properties: { facet: 'method', description: 'ML desc', domain: 'ai' },
    }]);
    mockLookupExternalIds.mockResolvedValue({ wikidata: 'Q2539' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await libraryLookupCommand('Machine Learning');
    expect(mockLookupExternalIds).toHaveBeenCalledWith(
      expect.objectContaining({ facet: 'method' }),
    );
    spy.mockRestore();
  });

  it('handles errors gracefully', async () => {
    mockLookupExternalIds.mockRejectedValue(new Error('API error'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await libraryLookupCommand('Test');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('libraryBackfillIdsCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('displays backfill results', async () => {
    mockBackfillExternalIds.mockResolvedValue({ updated: 5, skipped: 3, failed: 1 });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await libraryBackfillIdsCommand({});
    const output = spy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('5');
    expect(output).toContain('3');
    expect(output).toContain('1');
    spy.mockRestore();
  });

  it('passes dry-run option', async () => {
    mockBackfillExternalIds.mockResolvedValue({ updated: 0, skipped: 0, failed: 0 });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await libraryBackfillIdsCommand({ dryRun: true });
    expect(mockBackfillExternalIds).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
    spy.mockRestore();
  });

  it('passes facet filter', async () => {
    mockBackfillExternalIds.mockResolvedValue({ updated: 0, skipped: 0, failed: 0 });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await libraryBackfillIdsCommand({ facet: 'entity' });
    expect(mockBackfillExternalIds).toHaveBeenCalledWith(
      expect.objectContaining({ facet: 'entity' }),
    );
    spy.mockRestore();
  });

  it('handles errors gracefully', async () => {
    mockBackfillExternalIds.mockRejectedValue(new Error('DB error'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await libraryBackfillIdsCommand({});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
