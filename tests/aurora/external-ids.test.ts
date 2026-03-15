import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to create mock fns accessible inside vi.mock factory
const { mockLoadAuroraGraph, mockSaveAuroraGraph } = vi.hoisted(() => ({
  mockLoadAuroraGraph: vi.fn(),
  mockSaveAuroraGraph: vi.fn(),
}));

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: mockLoadAuroraGraph,
  saveAuroraGraph: mockSaveAuroraGraph,
}));

import {
  disambiguationScore,
  lookupWikidata,
  lookupROR,
  lookupORCID,
  lookupExternalIds,
  backfillExternalIds,
  type ExternalIds,
} from '../../src/aurora/external-ids.js';

// ---------------------------------------------------------------------------
//  disambiguationScore — pure function, no mocks needed
// ---------------------------------------------------------------------------

describe('disambiguationScore()', () => {
  it('returns 1.0-weighted name score for exact match', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'Machine Learning', description: '' },
      { name: 'Machine Learning' },
    );
    // name score 1.0 * 0.6 = 0.6, rest 0 → total 0.6
    expect(score).toBeCloseTo(0.6, 1);
  });

  it('scores case-insensitive exact match at 0.9 name weight', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'machine learning', description: '' },
      { name: 'Machine Learning' },
    );
    // name 0.9 * 0.6 = 0.54
    expect(score).toBeCloseTo(0.54, 1);
  });

  it('scores substring match at 0.5 name weight', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'Deep Machine Learning Systems', description: '' },
      { name: 'Machine Learning' },
    );
    // name 0.5 * 0.6 = 0.30
    expect(score).toBeCloseTo(0.3, 1);
  });

  it('returns 0 for completely unrelated names', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'Banana', description: '' },
      { name: 'Quantum Computing' },
    );
    expect(score).toBe(0);
  });

  it('adds description overlap score', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'CRISPR', description: 'gene editing technology in biology' },
      { name: 'CRISPR', description: 'gene editing method', domain: 'biology' },
    );
    // name 1.0*0.6=0.6, description overlap > 0, domain > 0
    expect(score).toBeGreaterThan(0.6);
  });

  it('adds domain relevance when description mentions domain', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'Transformer', description: 'model architecture in artificial intelligence' },
      { name: 'Transformer', domain: 'artificial intelligence' },
    );
    expect(score).toBeGreaterThan(0.6);
  });

  it('is always clamped between 0.0 and 1.0', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'Test', description: 'test test test test test' },
      { name: 'Test', description: 'test test test test test', domain: 'test', facet: 'test' },
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('computes a valid score with empty description on wikidataResult', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'Neural Network', description: '' },
      { name: 'Neural Network', description: 'computational model', domain: 'AI' },
    );
    // name exact match = 1.0*0.6=0.6, descScore=0 (wdDesc empty), domainScore=0
    expect(score).toBeCloseTo(0.6, 1);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('computes a valid score when concept has no description or domain', () => {
    const score = disambiguationScore(
      { id: 'Q1', label: 'Gradient Descent', description: 'optimization algorithm' },
      { name: 'Gradient Descent' },
    );
    // name exact = 1.0*0.6=0.6, no concept description/domain so descScore=0, domainScore=0
    expect(score).toBeCloseTo(0.6, 1);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
//  API lookup functions — mock global fetch
// ---------------------------------------------------------------------------

describe('lookupWikidata()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ExternalIds for a good match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          search: [
            { id: 'Q2539', label: 'Machine Learning', description: 'branch of AI' },
          ],
        }),
      }),
    );

    const result = await lookupWikidata('Machine Learning', 'topic', 'branch of AI');
    expect(result.wikidata).toBe('Q2539');
    expect(result.wikidataLabel).toBe('Machine Learning');
  });

  it('returns {} when no results match above threshold', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          search: [
            { id: 'Q999', label: 'Completely Different', description: 'unrelated item' },
          ],
        }),
      }),
    );

    const result = await lookupWikidata('Machine Learning');
    expect(result).toEqual({});
  });

  it('returns {} on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await lookupWikidata('Machine Learning');
    expect(result).toEqual({});
  });

  it('returns {} with malformed JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token'); },
      }),
    );

    const result = await lookupWikidata('Machine Learning');
    expect(result).toEqual({});
  });
});

describe('lookupROR()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ror ID for matching organisation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: 'https://ror.org/05f950310', names: [{ value: 'Stockholm University' }] },
          ],
        }),
      }),
    );

    const result = await lookupROR('Stockholm University');
    expect(result.ror).toBe('https://ror.org/05f950310');
  });

  it('returns {} on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await lookupROR('Stockholm University');
    expect(result).toEqual({});
  });

  it('returns {} with malformed JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => { throw new SyntaxError('Unexpected token'); },
      }),
    );

    const result = await lookupROR('Stockholm University');
    expect(result).toEqual({});
  });
});

describe('lookupORCID()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns orcid path for a person', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: [
            { 'orcid-identifier': { path: '0000-0002-1234-5678' } },
          ],
        }),
      }),
    );

    const result = await lookupORCID('John Smith');
    expect(result.orcid).toBe('0000-0002-1234-5678');
  });

  it('returns {} when no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ result: [] }),
      }),
    );

    const result = await lookupORCID('John Smith');
    expect(result).toEqual({});
  });
});

describe('lookupExternalIds()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('routes entity facet with person name to ORCID + Wikidata', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        if (url.includes('orcid.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              result: [{ 'orcid-identifier': { path: '0000-0001-0000-0000' } }],
            }),
          });
        }
        if (url.includes('wikidata.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              search: [
                { id: 'Q42', label: 'Albert Einstein', description: 'physicist' },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false });
      }),
    );

    const result = await lookupExternalIds({
      name: 'Albert Einstein',
      facet: 'entity',
    });

    expect(result.orcid).toBe('0000-0001-0000-0000');
    // Wikidata is also called as fallback
    expect(calls.some((u) => u.includes('wikidata.org'))).toBe(true);
  });

  it('routes entity facet with org name to ROR + Wikidata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('ror.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              items: [{ id: 'https://ror.org/123', names: [{ value: 'MIT University' }] }],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ search: [] }),
        });
      }),
    );

    const result = await lookupExternalIds({
      name: 'MIT University',
      facet: 'entity',
    });
    expect(result.ror).toBe('https://ror.org/123');
  });

  it('routes method facet to Wikidata and CrossRef', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        if (url.includes('crossref.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ status: 'ok', message: { items: [], 'total-results': 0 } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ search: [] }),
        });
      }),
    );

    await lookupExternalIds({ name: 'Bayesian Inference', facet: 'method' });
    expect(calls.some((u) => u.includes('wikidata.org'))).toBe(true);
    expect(calls.some((u) => u.includes('crossref.org'))).toBe(true);
  });

  it('routes tool facet to Wikidata', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            search: [
              { id: 'Q7397', label: 'TensorFlow', description: 'open-source machine learning framework' },
            ],
          }),
        });
      }),
    );

    await lookupExternalIds({ name: 'TensorFlow', facet: 'tool' });
    expect(calls.every((u) => u.includes('wikidata.org'))).toBe(true);
    // No ROR or ORCID calls for tool facet
    expect(calls.some((u) => u.includes('ror.org'))).toBe(false);
    expect(calls.some((u) => u.includes('orcid.org'))).toBe(false);
  });

  it('routes domain facet to Wikidata', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            search: [
              { id: 'Q21198', label: 'Computer Science', description: 'study of computation' },
            ],
          }),
        });
      }),
    );

    await lookupExternalIds({ name: 'Computer Science', facet: 'domain' });
    expect(calls.every((u) => u.includes('wikidata.org'))).toBe(true);
    expect(calls.some((u) => u.includes('ror.org'))).toBe(false);
    expect(calls.some((u) => u.includes('orcid.org'))).toBe(false);
  });

  it('merges results from multiple APIs for entity/org', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('ror.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              items: [{ id: 'https://ror.org/03vek6s52', names: [{ value: 'Harvard University' }] }],
            }),
          });
        }
        if (url.includes('wikidata.org')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              search: [
                { id: 'Q13371', label: 'Harvard University', description: 'private university in Cambridge, Massachusetts' },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false });
      }),
    );

    const result = await lookupExternalIds({
      name: 'Harvard University',
      facet: 'entity',
    });

    // Should include both ROR and Wikidata results merged
    expect(result.ror).toBe('https://ror.org/03vek6s52');
    expect(result.wikidata).toBe('Q13371');
    expect(result.wikidataLabel).toBe('Harvard University');
  });
});

// ---------------------------------------------------------------------------
//  backfillExternalIds — aurora-graph is mocked at module level
// ---------------------------------------------------------------------------

describe('backfillExternalIds()', () => {
  beforeEach(() => {
    mockLoadAuroraGraph.mockResolvedValue({ nodes: [], edges: [], lastUpdated: '' });
    mockSaveAuroraGraph.mockResolvedValue(undefined);
  });

  it('returns { updated: 0, skipped: 0, failed: 0 } for empty graph', async () => {
    const result = await backfillExternalIds();
    expect(result).toEqual({ updated: 0, skipped: 0, failed: 0 });
  });
});
