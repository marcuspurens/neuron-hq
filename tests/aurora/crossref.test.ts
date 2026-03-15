import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted for mock fns accessible inside vi.mock factory
const {
  mockLoadAuroraGraph,
  mockSaveAuroraGraph,
  mockAddAuroraNode,
  mockAddAuroraEdge,
  mockFindAuroraNodes,
} = vi.hoisted(() => ({
  mockLoadAuroraGraph: vi.fn(),
  mockSaveAuroraGraph: vi.fn(),
  mockAddAuroraNode: vi.fn(),
  mockAddAuroraEdge: vi.fn(),
  mockFindAuroraNodes: vi.fn(),
}));

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: mockLoadAuroraGraph,
  saveAuroraGraph: mockSaveAuroraGraph,
  addAuroraNode: mockAddAuroraNode,
  addAuroraEdge: mockAddAuroraEdge,
  findAuroraNodes: mockFindAuroraNodes,
}));

import {
  parseCrossRefWork,
  lookupDOI,
  searchCrossRef,
  crossrefDisambiguationScore,
  findRelatedWorks,
  formatCitation,
  ingestFromDOI,
  CROSSREF_USER_AGENT,
  type CrossRefWork,
} from '../../src/aurora/crossref.js';

// ---------------------------------------------------------------------------
//  parseCrossRefWork — pure function
// ---------------------------------------------------------------------------

describe('parseCrossRefWork()', () => {
  it('parses a complete CrossRef API item', () => {
    const item = {
      DOI: '10.1038/nature12373',
      title: ['Genomic analysis reveals key aspects'],
      author: [
        { given: 'Jane', family: 'Smith' },
        { given: 'John', family: 'Doe' },
      ],
      'published-print': { 'date-parts': [[2023, 6, 15]] },
      'container-title': ['Nature'],
      volume: '498',
      issue: '7453',
      page: '236-240',
      abstract: '<p>This is the <b>abstract</b>.</p>',
      'is-referenced-by-count': 42,
      type: 'journal-article',
    };

    const result = parseCrossRefWork(item);
    expect(result.doi).toBe('10.1038/nature12373');
    expect(result.title).toBe('Genomic analysis reveals key aspects');
    expect(result.authors).toEqual(['Jane Smith', 'John Doe']);
    expect(result.published).toBe('2023-06-15');
    expect(result.journal).toBe('Nature');
    expect(result.volume).toBe('498');
    expect(result.issue).toBe('7453');
    expect(result.pages).toBe('236-240');
    expect(result.abstract).toBe('This is the abstract.');
    expect(result.citationCount).toBe(42);
    expect(result.type).toBe('journal-article');
    expect(result.url).toBe('https://doi.org/10.1038/nature12373');
  });

  it('handles missing fields gracefully', () => {
    const result = parseCrossRefWork({});
    expect(result.doi).toBe('');
    expect(result.title).toBe('');
    expect(result.authors).toEqual([]);
    expect(result.published).toBe('');
    expect(result.journal).toBeUndefined();
    expect(result.abstract).toBeUndefined();
    expect(result.type).toBe('unknown');
  });

  it('falls back to published-online when published-print is missing', () => {
    const result = parseCrossRefWork({
      DOI: '10.1234/test',
      title: ['Online paper'],
      'published-online': { 'date-parts': [[2024, 1]] },
    });
    expect(result.published).toBe('2024-01-01');
  });

  it('strips HTML from abstract', () => {
    const result = parseCrossRefWork({
      abstract: '<jats:p>Abstract <jats:bold>text</jats:bold></jats:p>',
    });
    expect(result.abstract).toBe('Abstract text');
  });
});

// ---------------------------------------------------------------------------
//  crossrefDisambiguationScore — pure function
// ---------------------------------------------------------------------------

describe('crossrefDisambiguationScore()', () => {
  const baseWork: CrossRefWork = {
    doi: '10.1234/test',
    title: 'Machine Learning Applications',
    authors: [],
    published: '2023-01-01',
    type: 'journal-article',
    url: 'https://doi.org/10.1234/test',
  };

  it('returns high score for exact title match', () => {
    const score = crossrefDisambiguationScore(baseWork, {
      name: 'Machine Learning Applications',
    });
    // title 1.0 * 0.4 = 0.4 minimum
    expect(score).toBeGreaterThanOrEqual(0.4);
  });

  it('returns 0 for unrelated work', () => {
    const score = crossrefDisambiguationScore(baseWork, {
      name: 'Banana Cultivation Methods',
    });
    expect(score).toBeLessThan(0.3);
  });

  it('increases score with abstract overlap', () => {
    const workWithAbstract: CrossRefWork = {
      ...baseWork,
      abstract: 'Deep neural networks for natural language processing tasks',
    };
    const scoreWithout = crossrefDisambiguationScore(baseWork, {
      name: 'Neural Networks',
      description: 'deep neural networks for language tasks',
    });
    const scoreWith = crossrefDisambiguationScore(workWithAbstract, {
      name: 'Neural Networks',
      description: 'deep neural networks for language tasks',
    });
    expect(scoreWith).toBeGreaterThan(scoreWithout);
  });

  it('increases score with journal domain match', () => {
    const workWithJournal: CrossRefWork = {
      ...baseWork,
      journal: 'Journal of Artificial Intelligence Research',
    };
    const score = crossrefDisambiguationScore(workWithJournal, {
      name: 'Machine Learning Applications',
      domain: 'Artificial Intelligence',
    });
    expect(score).toBeGreaterThan(0.4);
  });

  it('uses citation count as tiebreaker', () => {
    const lowCitations = { ...baseWork, citationCount: 1 };
    const highCitations = { ...baseWork, citationCount: 500 };
    const concept = { name: 'Machine Learning Applications' };
    const scoreLow = crossrefDisambiguationScore(lowCitations, concept);
    const scoreHigh = crossrefDisambiguationScore(highCitations, concept);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('is clamped between 0.0 and 1.0', () => {
    const score = crossrefDisambiguationScore(
      { ...baseWork, citationCount: 99999 },
      { name: 'Machine Learning Applications', description: 'test', domain: 'test' },
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
//  formatCitation — pure function
// ---------------------------------------------------------------------------

describe('formatCitation()', () => {
  const work: CrossRefWork = {
    doi: '10.1038/nature12373',
    title: 'Genomic analysis reveals key aspects',
    authors: ['Jane Smith', 'John Doe'],
    published: '2023-06-15',
    journal: 'Nature',
    volume: '498',
    pages: '236-240',
    type: 'journal-article',
    url: 'https://doi.org/10.1038/nature12373',
  };

  it('formats APA citation', () => {
    const citation = formatCitation(work, 'apa');
    expect(citation).toContain('Smith, J.');
    expect(citation).toContain('Doe, J.');
    expect(citation).toContain('(2023)');
    expect(citation).toContain('Genomic analysis reveals key aspects');
    expect(citation).toContain('*Nature*');
    expect(citation).toContain('https://doi.org/10.1038/nature12373');
  });

  it('formats MLA citation', () => {
    const citation = formatCitation(work, 'mla');
    expect(citation).toContain('Smith, Jane');
    expect(citation).toContain('John Doe');
    expect(citation).toContain('"Genomic analysis reveals key aspects."');
    expect(citation).toContain('Nature');
    expect(citation).toContain('(2023)');
  });

  it('handles single author in APA', () => {
    const singleAuthorWork: CrossRefWork = {
      doi: '10.1234/single',
      title: 'Solo Research',
      authors: ['Alice Wonder'],
      published: '2022-03-10',
      type: 'journal-article',
      url: 'https://doi.org/10.1234/single',
    };
    const citation = formatCitation(singleAuthorWork, 'apa');
    expect(citation).toContain('Wonder, A.');
    expect(citation).not.toContain('&');
    expect(citation).toContain('2022');
  });

  it('handles work with no authors', () => {
    const noAuthorWork: CrossRefWork = {
      doi: '10.1234/noauthor',
      title: 'Anonymous Report',
      authors: [],
      published: '2021-01-01',
      type: 'report',
      url: 'https://doi.org/10.1234/noauthor',
    };
    const citation = formatCitation(noAuthorWork, 'apa');
    expect(citation).toContain('Anonymous Report');
    expect(citation).toContain('2021');
  });
});

// ---------------------------------------------------------------------------
//  lookupDOI — mock fetch
// ---------------------------------------------------------------------------

describe('lookupDOI()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns CrossRefWork for a valid DOI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            DOI: '10.1038/test',
            title: ['Test Paper'],
            author: [{ given: 'Jane', family: 'Smith' }],
            'published-print': { 'date-parts': [[2023, 1, 15]] },
            type: 'journal-article',
          },
        }),
      }),
    );

    const result = await lookupDOI('10.1038/test');
    expect(result).not.toBeNull();
    expect(result!.doi).toBe('10.1038/test');
    expect(result!.title).toBe('Test Paper');
  });

  it('returns null on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    const result = await lookupDOI('10.9999/nonexistent');
    expect(result).toBeNull();
  });

  it('returns null on fetch error (with retry)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await lookupDOI('10.1038/test');
    expect(result).toBeNull();
  });

  it('sends correct User-Agent header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { DOI: '10.1038/test', title: ['Test'], type: 'journal-article' },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await lookupDOI('10.1038/test');
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers['User-Agent']).toBe(CROSSREF_USER_AGENT);
  });
});

// ---------------------------------------------------------------------------
//  searchCrossRef — mock fetch
// ---------------------------------------------------------------------------

describe('searchCrossRef()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns works for a query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            items: [
              { DOI: '10.1234/a', title: ['Paper A'], type: 'journal-article' },
              { DOI: '10.1234/b', title: ['Paper B'], type: 'journal-article' },
            ],
          },
        }),
      }),
    );

    const results = await searchCrossRef({ query: 'machine learning' });
    expect(results).toHaveLength(2);
    expect(results[0].doi).toBe('10.1234/a');
  });

  it('uses query.bibliographic and query.author when author provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { items: [] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await searchCrossRef({ query: 'neural networks', author: 'Smith' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('query.bibliographic=');
    expect(url).toContain('query.author=Smith');
  });

  it('defaults to 5 rows', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { items: [] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await searchCrossRef({ query: 'test' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('rows=5');
  });

  it('returns empty array on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const results = await searchCrossRef({ query: 'test' });
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
//  ingestFromDOI — mock aurora-graph + fetch
// ---------------------------------------------------------------------------

describe('ingestFromDOI()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
    mockAddAuroraNode.mockReset();
    mockAddAuroraEdge.mockReset();
    mockFindAuroraNodes.mockReset();
  });

  it('creates a research node from a DOI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            DOI: '10.1038/nature12373',
            title: ['Important Discovery'],
            author: [{ given: 'Jane', family: 'Smith' }],
            'published-print': { 'date-parts': [[2023, 6, 15]] },
            type: 'journal-article',
          },
        }),
      }),
    );

    const mockGraph = { nodes: [], edges: [], lastUpdated: new Date().toISOString() };
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);
    mockAddAuroraNode.mockImplementation(
      (g: unknown, _n: unknown) => g,
    );
    mockFindAuroraNodes.mockReturnValue([]);
    mockSaveAuroraGraph.mockResolvedValue(undefined);

    const result = await ingestFromDOI('10.1038/nature12373');
    expect(result.title).toBe('Important Discovery');
    expect(result.nodeId).toBeDefined();
    expect(mockAddAuroraNode).toHaveBeenCalledTimes(1);
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(1);
  });

  it('throws when DOI not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(ingestFromDOI('10.9999/nonexistent')).rejects.toThrow('DOI not found');
  });
});

// ---------------------------------------------------------------------------
//  findRelatedWorks — mock fetch
// ---------------------------------------------------------------------------

describe('findRelatedWorks()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns works above disambiguation threshold', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            items: [{
              DOI: '10.1234/test',
              title: ['Machine Learning in Practice'],
              author: [{ given: 'Jane', family: 'Smith' }],
              'published-print': { 'date-parts': [[2023, 6, 15]] },
              'container-title': ['Nature'],
              type: 'journal-article',
              'is-referenced-by-count': 50,
              abstract: 'A study of machine learning applications',
            }],
          },
        }),
      }),
    );
    const results = await findRelatedWorks({
      title: 'Machine Learning',
      description: 'study of machine learning',
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].doi).toBe('10.1234/test');
  });

  it('returns empty array when no works match above threshold', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            items: [{
              DOI: '10.1234/unrelated',
              title: ['Banana Cultivation Methods'],
              author: [],
              type: 'journal-article',
              'is-referenced-by-count': 0,
            }],
          },
        }),
      }),
    );
    const results = await findRelatedWorks({
      title: 'Quantum Computing',
      description: 'quantum physics computation',
    });
    expect(results).toEqual([]);
  });

  it('respects maxResults parameter', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { items: [] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await findRelatedWorks({ title: 'Test', maxResults: 3 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('rows=6');
  });
});
