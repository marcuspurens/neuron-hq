import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock aurora-graph module for async tests (hoisted by vitest)
vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: vi.fn(),
}));

// Mock fs/promises for exportToFile tests
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return { ...actual, default: { ...(actual as Record<string, unknown>).default as object, writeFile: vi.fn() }, writeFile: vi.fn() };
});

import {
  JSONLD_CONTEXT,
  buildSameAs,
  nodeToJsonLd,
  validateJsonLd,
  articleToJsonLd,
  conceptTreeToJsonLd,
  ontologyToJsonLd,
  exportToFile,
} from '../../src/aurora/jsonld-export.js';
import { loadAuroraGraph } from '../../src/aurora/aurora-graph.js';
import type { AuroraNode } from '../../src/aurora/aurora-schema.js';
import type { AuroraGraph, AuroraEdge } from '../../src/aurora/aurora-schema.js';

const mockLoadGraph = vi.mocked(loadAuroraGraph);

/** Helper to build a minimal AuroraNode for testing. */
function makeNode(overrides: Partial<AuroraNode> & { type: AuroraNode['type'] }): AuroraNode {
  return {
    id: overrides.id ?? 'test-node-1',
    type: overrides.type,
    title: overrides.title ?? 'Test Node',
    properties: overrides.properties ?? {},
    confidence: overrides.confidence ?? 0.9,
    scope: overrides.scope ?? 'personal',
    sourceUrl: overrides.sourceUrl ?? null,
    created: overrides.created ?? '2025-01-01T00:00:00.000Z',
    updated: overrides.updated ?? '2025-01-01T00:00:00.000Z',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. JSONLD_CONTEXT (2 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('JSONLD_CONTEXT', () => {
  it('has all required namespace prefixes', () => {
    expect(JSONLD_CONTEXT).toHaveProperty('schema', 'https://schema.org/');
    expect(JSONLD_CONTEXT).toHaveProperty('skos', 'http://www.w3.org/2004/02/skos/core#');
    expect(JSONLD_CONTEXT).toHaveProperty('ebucore', 'urn:ebu:metadata-schema:ebucore');
    expect(JSONLD_CONTEXT).toHaveProperty('dc', 'http://purl.org/dc/elements/1.1/');
    expect(JSONLD_CONTEXT).toHaveProperty('dcterms', 'http://purl.org/dc/terms/');
    expect(JSONLD_CONTEXT).toHaveProperty('wikidata', 'http://www.wikidata.org/entity/');
  });

  it('has term mappings for prefLabel, broader, narrower, sameAs, etc.', () => {
    expect(JSONLD_CONTEXT['prefLabel']).toBe('skos:prefLabel');
    expect(JSONLD_CONTEXT['altLabel']).toBe('skos:altLabel');
    expect(JSONLD_CONTEXT['broader']).toBe('skos:broader');
    expect(JSONLD_CONTEXT['narrower']).toBe('skos:narrower');
    expect(JSONLD_CONTEXT['sameAs']).toBe('schema:sameAs');
    expect(JSONLD_CONTEXT['name']).toBe('schema:name');
    expect(JSONLD_CONTEXT['description']).toBe('schema:description');
    expect(JSONLD_CONTEXT['dateCreated']).toBe('schema:dateCreated');
    expect(JSONLD_CONTEXT['dateModified']).toBe('schema:dateModified');
    expect(JSONLD_CONTEXT['identifier']).toBe('schema:identifier');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. nodeToJsonLd — Concept (5 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('nodeToJsonLd — Concept', () => {
  it('maps a basic concept with title, description, and aliases', () => {
    const node = makeNode({
      type: 'concept',
      id: 'concept_ai',
      title: 'Artificial Intelligence',
      properties: {
        description: 'The study of intelligent agents',
        aliases: ['AI', 'Machine Intelligence'],
        facet: 'topic',
        domain: 'technology',
        articleCount: 5,
        depth: 0,
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;

    expect(result['@type']).toBe('skos:Concept');
    expect(result['@id']).toBe('urn:aurora:concept:concept_ai');
    expect(result['prefLabel']).toBe('Artificial Intelligence');
    expect(result['altLabel']).toEqual(['AI', 'Machine Intelligence']);
    expect(result['description']).toBe('The study of intelligent agents');
    expect(result['identifier']).toBe('concept_ai');
    expect(result['dateCreated']).toBe('2025-01-01T00:00:00.000Z');
    expect(result['dateModified']).toBe('2025-01-01T00:00:00.000Z');
    expect(result['@context']).toEqual(JSONLD_CONTEXT);
  });

  it('includes sameAs for concept with wikidata standardRef', () => {
    const node = makeNode({
      type: 'concept',
      id: 'concept_ai',
      title: 'Artificial Intelligence',
      properties: {
        description: 'AI',
        aliases: [],
        standardRefs: { wikidata: 'Q11660' },
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;
    const sameAs = result['sameAs'] as Array<{ '@id': string }>;

    expect(sameAs).toHaveLength(1);
    expect(sameAs[0]['@id']).toBe('http://www.wikidata.org/entity/Q11660');
  });

  it('omits altLabel when aliases are empty', () => {
    const node = makeNode({
      type: 'concept',
      id: 'concept_empty',
      title: 'Empty Aliases',
      properties: {
        description: 'No aliases',
        aliases: [],
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;
    expect(result).not.toHaveProperty('altLabel');
  });

  it('omits sameAs when includeExternalIds=false', () => {
    const node = makeNode({
      type: 'concept',
      id: 'concept_ext',
      title: 'With Refs',
      properties: {
        description: 'Has refs',
        aliases: [],
        standardRefs: { wikidata: 'Q12345' },
      },
    });

    const result = nodeToJsonLd(node, { includeExternalIds: false }) as Record<string, unknown>;
    expect(result).not.toHaveProperty('sameAs');
  });

  it('omits @context when includeContext=false', () => {
    const node = makeNode({
      type: 'concept',
      id: 'concept_nocontext',
      title: 'No Context',
      properties: { description: 'test', aliases: [] },
    });

    const result = nodeToJsonLd(node, { includeContext: false }) as Record<string, unknown>;
    expect(result).not.toHaveProperty('@context');
    // Other fields should still be present
    expect(result['@type']).toBe('skos:Concept');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. nodeToJsonLd — Article (4 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('nodeToJsonLd — Article', () => {
  it('maps a basic article with correct @type, @id, name, description, wordCount', () => {
    const node = makeNode({
      type: 'article',
      id: 'article-001',
      title: 'Understanding AI',
      properties: {
        abstract: 'An overview of artificial intelligence',
        wordCount: 1500,
        content: 'Full article text...',
        domain: 'technology',
        tags: ['ai'],
        concepts: [],
        version: 1,
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;

    expect(result['@type']).toBe('schema:Article');
    expect(result['@id']).toBe('urn:aurora:article:article-001');
    expect(result['name']).toBe('Understanding AI');
    expect(result['description']).toBe('An overview of artificial intelligence');
    expect(result['schema:wordCount']).toBe(1500);
    expect(result['dateCreated']).toBe('2025-01-01T00:00:00.000Z');
  });

  it('includes about array with concept @id refs', () => {
    const node = makeNode({
      type: 'article',
      id: 'article-002',
      title: 'ML Article',
      properties: {
        abstract: 'Machine learning overview',
        wordCount: 800,
        concepts: ['concept_ml', 'concept_ai'],
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;
    const about = result['about'] as Array<{ '@id': string }>;

    expect(about).toHaveLength(2);
    expect(about[0]['@id']).toBe('urn:aurora:concept:concept_ml');
    expect(about[1]['@id']).toBe('urn:aurora:concept:concept_ai');
  });

  it('omits about array when concepts are empty', () => {
    const node = makeNode({
      type: 'article',
      id: 'article-003',
      title: 'No Concepts',
      properties: {
        abstract: 'An article without concepts',
        wordCount: 200,
        concepts: [],
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;
    expect(result).not.toHaveProperty('about');
  });

  it('works with all options off', () => {
    const node = makeNode({
      type: 'article',
      id: 'article-004',
      title: 'Minimal',
      properties: {
        abstract: 'Short',
        wordCount: 10,
        concepts: [],
      },
    });

    const result = nodeToJsonLd(node, {
      includeContext: false,
      includeEbucore: false,
      includeExternalIds: false,
    }) as Record<string, unknown>;

    expect(result).not.toHaveProperty('@context');
    expect(result['@type']).toBe('schema:Article');
    expect(result['name']).toBe('Minimal');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. nodeToJsonLd — Transcript (3 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('nodeToJsonLd — Transcript', () => {
  it('includes ebucore fields from getEbucoreMetadata', () => {
    const node = makeNode({
      type: 'transcript',
      id: 'transcript-001',
      title: 'Interview with Dr. Smith',
      properties: {
        duration: 3600,
        language: 'en',
        videoUrl: 'https://youtube.com/watch?v=abc',
        platform: 'youtube',
        segmentCount: 10,
        publishedDate: '2025-06-01',
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;

    expect(result['@type']).toBe('ebucore:EditorialObject');
    expect(result['@id']).toBe('urn:aurora:transcript:transcript-001');
    expect(result['name']).toBe('Interview with Dr. Smith');
    expect(result['ebucore:duration']).toBe(3600);
    expect(result['ebucore:hasLanguage']).toBe('en');
    expect(result['ebucore:title']).toBe('Interview with Dr. Smith');
  });

  it('omits ebucore fields when includeEbucore=false', () => {
    const node = makeNode({
      type: 'transcript',
      id: 'transcript-002',
      title: 'No EBUCore',
      properties: {
        duration: 120,
        language: 'sv',
      },
    });

    const result = nodeToJsonLd(node, { includeEbucore: false }) as Record<string, unknown>;

    expect(result['@type']).toBe('ebucore:EditorialObject');
    expect(result).not.toHaveProperty('ebucore:duration');
    expect(result).not.toHaveProperty('ebucore:hasLanguage');
  });

  it('maps transcript with language and duration ebucore fields', () => {
    const node = makeNode({
      type: 'transcript',
      id: 'transcript-003',
      title: 'Swedish Podcast',
      properties: {
        duration: 1800,
        language: 'sv',
        publishedDate: '2025-03-15',
      },
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;

    expect(result['ebucore:duration']).toBe(1800);
    expect(result['ebucore:hasLanguage']).toBe('sv');
    expect(result['ebucore:dateCreated']).toBe('2025-03-15');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. nodeToJsonLd — Other types (2 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('nodeToJsonLd — Other types', () => {
  it('maps a document node to schema:Thing with correct @id', () => {
    const node = makeNode({
      type: 'document',
      id: 'doc-001',
      title: 'My Document',
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;

    expect(result['@type']).toBe('schema:Thing');
    expect(result['@id']).toBe('urn:aurora:document:doc-001');
    expect(result['name']).toBe('My Document');
    expect(result['dateCreated']).toBe('2025-01-01T00:00:00.000Z');
  });

  it('maps a fact node to schema:Thing', () => {
    const node = makeNode({
      type: 'fact',
      id: 'fact-001',
      title: 'The sky is blue',
    });

    const result = nodeToJsonLd(node) as Record<string, unknown>;

    expect(result['@type']).toBe('schema:Thing');
    expect(result['@id']).toBe('urn:aurora:fact:fact-001');
    expect(result['name']).toBe('The sky is blue');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. buildSameAs (5 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSameAs', () => {
  it('maps wikidata Q-number to full entity URI', () => {
    const result = buildSameAs({ wikidata: 'Q12345' });
    expect(result).toEqual([{ '@id': 'http://www.wikidata.org/entity/Q12345' }]);
  });

  it('passes ROR URL through as-is', () => {
    const result = buildSameAs({ ror: 'https://ror.org/0abcdef12' });
    expect(result).toEqual([{ '@id': 'https://ror.org/0abcdef12' }]);
  });

  it('maps ORCID to full orcid.org URL', () => {
    const result = buildSameAs({ orcid: '0000-0001-2345-6789' });
    expect(result).toEqual([{ '@id': 'https://orcid.org/0000-0001-2345-6789' }]);
  });

  it('maps mixed refs to correct array', () => {
    const result = buildSameAs({
      wikidata: 'Q42',
      ror: 'https://ror.org/abc123',
      orcid: '0000-0002-0000-0001',
      doi: '10.1234/abc',
    });

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ '@id': 'http://www.wikidata.org/entity/Q42' });
    expect(result[1]).toEqual({ '@id': 'https://ror.org/abc123' });
    expect(result[2]).toEqual({ '@id': 'https://orcid.org/0000-0002-0000-0001' });
    expect(result[3]).toEqual({ '@id': 'https://doi.org/10.1234/abc' });
  });

  it('skips empty and undefined values', () => {
    const result = buildSameAs({
      wikidata: '',
      ror: 'https://ror.org/valid',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ '@id': 'https://ror.org/valid' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. validateJsonLd (7 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('validateJsonLd', () => {
  it('returns valid: true for a valid single object', () => {
    const doc = {
      '@context': JSONLD_CONTEXT,
      '@type': 'skos:Concept',
      '@id': 'urn:aurora:concept:test',
      'prefLabel': 'Test',
    };

    const result = validateJsonLd(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing @context', () => {
    const doc = {
      '@type': 'skos:Concept',
      '@id': 'urn:aurora:concept:test',
    };

    const result = validateJsonLd(doc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing @context');
  });

  it('reports object with @type but no @id', () => {
    const doc = {
      '@context': JSONLD_CONTEXT,
      '@type': 'schema:Article',
    };

    const result = validateJsonLd(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing @id'))).toBe(true);
  });

  it('reports duplicate @id values in @graph', () => {
    const doc = {
      '@context': JSONLD_CONTEXT,
      '@graph': [
        { '@type': 'skos:Concept', '@id': 'urn:aurora:concept:dup' },
        { '@type': 'skos:Concept', '@id': 'urn:aurora:concept:dup' },
      ],
    };

    const result = validateJsonLd(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate @id'))).toBe(true);
  });

  it('reports invalid sameAs URI', () => {
    const doc = {
      '@context': JSONLD_CONTEXT,
      '@type': 'skos:Concept',
      '@id': 'urn:aurora:concept:test',
      'sameAs': [{ '@id': 'not-a-valid-uri' }],
    };

    const result = validateJsonLd(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid sameAs URI'))).toBe(true);
  });

  it('validates @graph array — each item checked', () => {
    const doc = {
      '@context': JSONLD_CONTEXT,
      '@graph': [
        { '@type': 'skos:Concept', '@id': 'urn:aurora:concept:a', 'prefLabel': 'A' },
        { '@type': 'schema:Article', '@id': 'urn:aurora:article:b', 'name': 'B' },
      ],
    };

    const result = validateJsonLd(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates a nested valid object with context', () => {
    const node = makeNode({
      type: 'concept',
      id: 'concept-valid',
      title: 'Valid Concept',
      properties: {
        description: 'A valid concept',
        aliases: ['VC'],
      },
    });

    const jsonld = nodeToJsonLd(node);
    const result = validateJsonLd(jsonld);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// 8. articleToJsonLd (3 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('articleToJsonLd', () => {
  /** Build a test graph with articles, concepts, and about edges. */
  function makeTestGraph(): AuroraGraph {
    const nodes: AuroraNode[] = [
      makeNode({
        type: 'article',
        id: 'art-1',
        title: 'AI Article',
        properties: { abstract: 'About AI', wordCount: 500, concepts: [] },
      }),
      makeNode({
        type: 'concept',
        id: 'concept-ai',
        title: 'Artificial Intelligence',
        properties: { description: 'AI field', aliases: ['AI'] },
      }),
      makeNode({
        type: 'concept',
        id: 'concept-ml',
        title: 'Machine Learning',
        properties: { description: 'ML subset', aliases: [] },
      }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'art-1', to: 'concept-ai', type: 'about', metadata: {} },
      { from: 'art-1', to: 'concept-ml', type: 'about', metadata: {} },
    ];
    return { nodes, edges, lastUpdated: '2025-01-01T00:00:00.000Z' };
  }

  beforeEach(() => {
    mockLoadGraph.mockReset();
  });

  it('exports article with linked concepts as full JSON-LD in about', async () => {
    mockLoadGraph.mockResolvedValue(makeTestGraph());

    const result = (await articleToJsonLd('art-1')) as Record<string, unknown>;

    expect(result['@context']).toEqual(JSONLD_CONTEXT);
    expect(result['@type']).toBe('schema:Article');
    expect(result['@id']).toBe('urn:aurora:article:art-1');
    expect(result['name']).toBe('AI Article');

    const about = result['about'] as Array<Record<string, unknown>>;
    expect(about).toHaveLength(2);
    expect(about[0]['@type']).toBe('skos:Concept');
    expect(about[0]['prefLabel']).toBe('Artificial Intelligence');
    expect(about[1]['prefLabel']).toBe('Machine Learning');
  });

  it('throws when article is not found', async () => {
    mockLoadGraph.mockResolvedValue(makeTestGraph());

    await expect(articleToJsonLd('nonexistent')).rejects.toThrow(
      'Article not found: nonexistent',
    );
  });

  it('omits about when article has no about edges', async () => {
    const graph = makeTestGraph();
    // Remove all about edges
    graph.edges = [];
    mockLoadGraph.mockResolvedValue(graph);

    const result = (await articleToJsonLd('art-1')) as Record<string, unknown>;

    // The article node has concepts: [] so nodeToJsonLd won't add about either
    expect(result['@type']).toBe('schema:Article');
    // about should not be present from edges (no edges) or from properties (empty array)
    expect(result).not.toHaveProperty('about');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. conceptTreeToJsonLd (3 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('conceptTreeToJsonLd', () => {
  beforeEach(() => {
    mockLoadGraph.mockReset();
  });

  it('exports tree with root, children, broader/narrower', async () => {
    const nodes: AuroraNode[] = [
      makeNode({
        type: 'concept',
        id: 'root',
        title: 'Science',
        properties: { description: 'Root', aliases: [] },
      }),
      makeNode({
        type: 'concept',
        id: 'child-1',
        title: 'Physics',
        properties: { description: 'Physics', aliases: [] },
      }),
      makeNode({
        type: 'concept',
        id: 'child-2',
        title: 'Chemistry',
        properties: { description: 'Chemistry', aliases: [] },
      }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'root', to: 'child-1', type: 'broader_than', metadata: {} },
      { from: 'root', to: 'child-2', type: 'broader_than', metadata: {} },
    ];
    mockLoadGraph.mockResolvedValue({
      nodes,
      edges,
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = (await conceptTreeToJsonLd('root')) as Record<string, unknown>;

    expect(result['@context']).toEqual(JSONLD_CONTEXT);
    const graph = result['@graph'] as Array<Record<string, unknown>>;
    expect(graph).toHaveLength(3);

    // Root should have narrower
    const rootItem = graph.find((g) => g['prefLabel'] === 'Science')!;
    expect(rootItem['narrower']).toEqual([
      { '@id': 'urn:aurora:concept:child-1' },
      { '@id': 'urn:aurora:concept:child-2' },
    ]);

    // Children should have broader
    const child1 = graph.find((g) => g['prefLabel'] === 'Physics')!;
    expect(child1['broader']).toEqual({ '@id': 'urn:aurora:concept:root' });
  });

  it('returns single object (no @graph) for concept without children', async () => {
    const nodes: AuroraNode[] = [
      makeNode({
        type: 'concept',
        id: 'lonely',
        title: 'Lonely Concept',
        properties: { description: 'No children', aliases: [] },
      }),
    ];
    mockLoadGraph.mockResolvedValue({
      nodes,
      edges: [],
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = (await conceptTreeToJsonLd('lonely')) as Record<string, unknown>;

    // Single item: no @graph wrapper
    expect(result).not.toHaveProperty('@graph');
    expect(result['@type']).toBe('skos:Concept');
    expect(result['prefLabel']).toBe('Lonely Concept');
    expect(result['@context']).toEqual(JSONLD_CONTEXT);
  });

  it('throws when concept is not found', async () => {
    mockLoadGraph.mockResolvedValue({
      nodes: [],
      edges: [],
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    await expect(conceptTreeToJsonLd('missing')).rejects.toThrow(
      'Concept not found: missing',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. ontologyToJsonLd (2 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('ontologyToJsonLd', () => {
  beforeEach(() => {
    mockLoadGraph.mockReset();
  });

  it('exports all concepts with broader/narrower relations', async () => {
    const nodes: AuroraNode[] = [
      makeNode({
        type: 'concept',
        id: 'c1',
        title: 'Parent',
        properties: { description: 'Parent concept', aliases: [] },
      }),
      makeNode({
        type: 'concept',
        id: 'c2',
        title: 'Child',
        properties: { description: 'Child concept', aliases: [] },
      }),
      makeNode({
        type: 'article',
        id: 'a1',
        title: 'Some Article',
        properties: { abstract: 'Ignored', wordCount: 100, concepts: [] },
      }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'c1', to: 'c2', type: 'broader_than', metadata: {} },
    ];
    mockLoadGraph.mockResolvedValue({
      nodes,
      edges,
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = (await ontologyToJsonLd()) as Record<string, unknown>;

    expect(result['@context']).toEqual(JSONLD_CONTEXT);
    const graph = result['@graph'] as Array<Record<string, unknown>>;
    // Only concepts, not articles
    expect(graph).toHaveLength(2);

    const parent = graph.find((g) => g['prefLabel'] === 'Parent')!;
    expect(parent['narrower']).toEqual([{ '@id': 'urn:aurora:concept:c2' }]);

    const child = graph.find((g) => g['prefLabel'] === 'Child')!;
    expect(child['broader']).toEqual({ '@id': 'urn:aurora:concept:c1' });
  });

  it('returns empty @graph for graph with no concepts', async () => {
    mockLoadGraph.mockResolvedValue({
      nodes: [
        makeNode({
          type: 'article',
          id: 'a1',
          title: 'Article Only',
          properties: { abstract: 'No concepts here', wordCount: 50, concepts: [] },
        }),
      ],
      edges: [],
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const result = (await ontologyToJsonLd()) as Record<string, unknown>;
    const graph = result['@graph'] as unknown[];
    expect(graph).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. exportToFile (2 tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('exportToFile', () => {
  beforeEach(() => {
    mockLoadGraph.mockReset();
  });

  it('writes JSON to file and returns correct stats for ontology scope', async () => {
    const nodes: AuroraNode[] = [
      makeNode({
        type: 'concept',
        id: 'c1',
        title: 'Alpha',
        properties: { description: 'A', aliases: [] },
      }),
      makeNode({
        type: 'concept',
        id: 'c2',
        title: 'Beta',
        properties: { description: 'B', aliases: [] },
      }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'c1', to: 'c2', type: 'broader_than', metadata: {} },
    ];
    mockLoadGraph.mockResolvedValue({
      nodes,
      edges,
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const stats = await exportToFile('/fake/output.json', 'ontology');

    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
    expect(stats.fileSize).toBeGreaterThan(0);
  });

  it('returns correct stats for all scope', async () => {
    const nodes: AuroraNode[] = [
      makeNode({
        type: 'concept',
        id: 'c1',
        title: 'Concept',
        properties: { description: 'C', aliases: [] },
      }),
      makeNode({
        type: 'article',
        id: 'a1',
        title: 'Article',
        properties: { abstract: 'A', wordCount: 10, concepts: [] },
      }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'a1', to: 'c1', type: 'about', metadata: {} },
    ];
    mockLoadGraph.mockResolvedValue({
      nodes,
      edges,
      lastUpdated: '2025-01-01T00:00:00.000Z',
    });

    const stats = await exportToFile('/fake/all.json', 'all');

    expect(stats.nodeCount).toBe(2);
    expect(stats.edgeCount).toBe(1);
    expect(stats.fileSize).toBeGreaterThan(0);
  });
});
