import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph, AuroraNode, AuroraEdge } from '../../src/aurora/aurora-schema.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAddAuroraNode = vi.fn();
const mockAddAuroraEdge = vi.fn();
const mockAutoEmbedAuroraNodes = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  addAuroraNode: (...args: unknown[]) => mockAddAuroraNode(...args),
  addAuroraEdge: (...args: unknown[]) => mockAddAuroraEdge(...args),
  autoEmbedAuroraNodes: (...args: unknown[]) => mockAutoEmbedAuroraNodes(...args),
}));

const mockSemanticSearch = vi.fn();
vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: (...args: unknown[]) => mockSemanticSearch(...args),
}));

import {
  getOrCreateConcept,
  getConcept,
  listConcepts,
  getConceptTree,
  searchConcepts,
  linkArticleToConcepts,
  getOntologyStats,
  suggestMerges,
} from '../../src/aurora/ontology.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGraph(nodes: AuroraNode[] = [], edges: AuroraEdge[] = []): AuroraGraph {
  return { nodes, edges, lastUpdated: new Date().toISOString() };
}

function makeConceptNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  const now = new Date().toISOString();
  return {
    id: 'concept_test',
    type: 'concept',
    title: 'Test Concept',
    properties: {
      description: 'A test concept',
      domain: 'general',
      facet: 'topic',
      aliases: [],
      articleCount: 0,
      depth: 0,
    },
    confidence: 0.8,
    scope: 'personal',
    created: now,
    updated: now,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

let currentGraph: AuroraGraph;

beforeEach(() => {
  vi.clearAllMocks();
  currentGraph = makeGraph();

  mockLoadAuroraGraph.mockImplementation(() => Promise.resolve(currentGraph));
  mockSaveAuroraGraph.mockImplementation((g: AuroraGraph) => {
    currentGraph = g;
    return Promise.resolve();
  });
  mockAddAuroraNode.mockImplementation((graph: AuroraGraph, node: AuroraNode) => {
    const newGraph = {
      ...graph,
      nodes: [...graph.nodes, node],
      lastUpdated: new Date().toISOString(),
    };
    return newGraph;
  });
  mockAddAuroraEdge.mockImplementation((graph: AuroraGraph, edge: AuroraEdge) => ({
    ...graph,
    edges: [...graph.edges, edge],
    lastUpdated: new Date().toISOString(),
  }));
  mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  mockSemanticSearch.mockResolvedValue([]); // Default: no matches (create new)
});

/* ------------------------------------------------------------------ */
/*  getOrCreateConcept() tests                                         */
/* ------------------------------------------------------------------ */

describe('getOrCreateConcept()', () => {
  it('creates a new concept node with correct properties', async () => {
    const result = await getOrCreateConcept({
      name: 'Agile',
      description: 'Agile methodology',
      domain: 'pm',
    });

    expect(result.type).toBe('concept');
    expect(result.title).toBe('Agile');
    expect(result.properties.facet).toBe('topic');
    expect(result.properties.domain).toBe('pm');
    expect(result.properties.depth).toBe(0);
    expect(result.properties.aliases).toEqual([]);
    expect(result.properties.articleCount).toBe(0);
    expect(mockAddAuroraNode).toHaveBeenCalledOnce();
    expect(mockAddAuroraNode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'concept',
        title: 'Agile',
        properties: expect.objectContaining({
          facet: 'topic',
          domain: 'pm',
          depth: 0,
          aliases: [],
          articleCount: 0,
        }),
      }),
    );
  });

  it('uses facet from input', async () => {
    const result = await getOrCreateConcept({
      name: 'TypeScript',
      facet: 'entity',
    });

    expect(result.properties.facet).toBe('entity');
    expect(mockAddAuroraNode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        properties: expect.objectContaining({ facet: 'entity' }),
      }),
    );
  });

  it('defaults facet to topic when not specified', async () => {
    const result = await getOrCreateConcept({
      name: 'Testing',
    });

    expect(result.properties.facet).toBe('topic');
  });

  it('returns existing concept on semantic match', async () => {
    const existingNode = makeConceptNode({
      id: 'concept_agile',
      title: 'Agile',
      properties: {
        description: 'Agile methodology',
        domain: 'pm',
        facet: 'topic',
        aliases: [],
        articleCount: 5,
        depth: 0,
      },
    });
    currentGraph = makeGraph([existingNode]);

    mockSemanticSearch.mockResolvedValue([
      { id: 'concept_agile', title: 'Agile', similarity: 0.90 },
    ]);

    const result = await getOrCreateConcept({ name: 'Agile' });

    expect(result.id).toBe('concept_agile');
    expect(result.title).toBe('Agile');
    expect(mockAddAuroraNode).not.toHaveBeenCalled();
  });

  it('adds alias when name variant matches existing concept', async () => {
    const existingNode = makeConceptNode({
      id: 'concept_agile',
      title: 'Agile',
      properties: {
        description: 'Agile methodology',
        domain: 'pm',
        facet: 'topic',
        aliases: [],
        articleCount: 0,
        depth: 0,
      },
    });
    currentGraph = makeGraph([existingNode]);

    mockSemanticSearch.mockResolvedValue([
      { id: 'concept_agile', title: 'Agile', similarity: 0.90 },
    ]);

    await getOrCreateConcept({ name: 'Agilt' });

    // saveAuroraGraph should have been called with updated aliases
    expect(mockSaveAuroraGraph).toHaveBeenCalled();
    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const updatedNode = savedGraph.nodes.find((n) => n.id === 'concept_agile');
    expect(updatedNode).toBeDefined();
    expect(updatedNode!.properties.aliases).toContain('Agilt');
  });

  it('creates broader_than edge to parent', async () => {
    // Parent "PM" exists already
    const parentNode = makeConceptNode({
      id: 'concept_pm',
      title: 'PM',
      properties: {
        description: '',
        domain: 'general',
        facet: 'topic',
        aliases: [],
        articleCount: 0,
        depth: 0,
      },
    });
    currentGraph = makeGraph([parentNode]);

    // First call (for "Agile") => no match; second call (for "PM") => match
    mockSemanticSearch
      .mockResolvedValueOnce([]) // "Agile" search: no match
      .mockResolvedValueOnce([{ id: 'concept_pm', title: 'PM', similarity: 0.92 }]); // "PM" search: match

    await getOrCreateConcept({ name: 'Agile', broaderConceptName: 'PM' });

    expect(mockAddAuroraEdge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        from: 'concept_pm',
        to: 'concept_agile',
        type: 'broader_than',
      }),
    );
  });

  it('creates parent recursively if missing', async () => {
    // Both child and parent missing => semanticSearch returns empty for both
    mockSemanticSearch.mockResolvedValue([]);

    await getOrCreateConcept({ name: 'Scrum', broaderConceptName: 'PM' });

    // Two nodes should have been created (child + parent)
    expect(mockAddAuroraNode).toHaveBeenCalledTimes(2);
    const titles = mockAddAuroraNode.mock.calls.map(
      (call: unknown[]) => (call[1] as AuroraNode).title,
    );
    expect(titles).toContain('Scrum');
    expect(titles).toContain('PM');
  });

  it('throws on max recursion depth', async () => {
    await expect(
      getOrCreateConcept({ name: 'Deep', _depth: 6 }),
    ).rejects.toThrow('max recursion depth exceeded');
  });
});

/* ------------------------------------------------------------------ */
/*  getConcept() tests                                                 */
/* ------------------------------------------------------------------ */

describe('getConcept()', () => {
  it('returns concept node by id', async () => {
    const node = makeConceptNode({ id: 'concept_agile', title: 'Agile' });
    currentGraph = makeGraph([node]);

    const result = await getConcept('concept_agile');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('concept_agile');
    expect(result!.type).toBe('concept');
  });

  it('returns null for non-existent id', async () => {
    currentGraph = makeGraph();

    const result = await getConcept('concept_nonexistent');

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  listConcepts() tests                                               */
/* ------------------------------------------------------------------ */

describe('listConcepts()', () => {
  it('filters by domain', async () => {
    const nodes = [
      makeConceptNode({
        id: 'concept_1',
        title: 'Agile',
        properties: { description: '', domain: 'pm', facet: 'topic', aliases: [], articleCount: 0, depth: 0 },
      }),
      makeConceptNode({
        id: 'concept_2',
        title: 'TypeScript',
        properties: { description: '', domain: 'tech', facet: 'topic', aliases: [], articleCount: 0, depth: 0 },
      }),
      makeConceptNode({
        id: 'concept_3',
        title: 'Scrum',
        properties: { description: '', domain: 'pm', facet: 'topic', aliases: [], articleCount: 0, depth: 0 },
      }),
    ];
    currentGraph = makeGraph(nodes);

    const result = await listConcepts({ domain: 'pm' });

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.title)).toEqual(['Agile', 'Scrum']);
  });

  it('filters by facet', async () => {
    const nodes = [
      makeConceptNode({
        id: 'concept_1',
        title: 'TypeScript',
        properties: { description: '', domain: 'tech', facet: 'entity', aliases: [], articleCount: 0, depth: 0 },
      }),
      makeConceptNode({
        id: 'concept_2',
        title: 'Testing',
        properties: { description: '', domain: 'tech', facet: 'topic', aliases: [], articleCount: 0, depth: 0 },
      }),
      makeConceptNode({
        id: 'concept_3',
        title: 'Vitest',
        properties: { description: '', domain: 'tech', facet: 'entity', aliases: [], articleCount: 0, depth: 0 },
      }),
    ];
    currentGraph = makeGraph(nodes);

    const result = await listConcepts({ facet: 'entity' });

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.title)).toEqual(['TypeScript', 'Vitest']);
  });

  it('returns only roots when rootsOnly is true', async () => {
    const nodes = [
      makeConceptNode({ id: 'concept_parent', title: 'Parent' }),
      makeConceptNode({ id: 'concept_child', title: 'Child' }),
      makeConceptNode({ id: 'concept_orphan', title: 'Orphan' }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'concept_parent', to: 'concept_child', type: 'broader_than', metadata: {} },
    ];
    currentGraph = makeGraph(nodes, edges);

    const result = await listConcepts({ rootsOnly: true });

    expect(result).toHaveLength(2);
    const titles = result.map((c) => c.title);
    expect(titles).toContain('Parent');
    expect(titles).toContain('Orphan');
    expect(titles).not.toContain('Child');
  });

  it('returns children of a specific parent', async () => {
    const nodes = [
      makeConceptNode({ id: 'concept_parent', title: 'Parent' }),
      makeConceptNode({ id: 'concept_child1', title: 'Child1' }),
      makeConceptNode({ id: 'concept_child2', title: 'Child2' }),
      makeConceptNode({ id: 'concept_other', title: 'Other' }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'concept_parent', to: 'concept_child1', type: 'broader_than', metadata: {} },
      { from: 'concept_parent', to: 'concept_child2', type: 'broader_than', metadata: {} },
    ];
    currentGraph = makeGraph(nodes, edges);

    const result = await listConcepts({ parentId: 'concept_parent' });

    expect(result).toHaveLength(2);
    expect(result.map((c) => c.title).sort()).toEqual(['Child1', 'Child2']);
  });
});

/* ------------------------------------------------------------------ */
/*  getConceptTree() tests                                             */
/* ------------------------------------------------------------------ */

describe('getConceptTree()', () => {
  it('returns hierarchical tree', async () => {
    const nodes = [
      makeConceptNode({ id: 'concept_root', title: 'Root' }),
      makeConceptNode({ id: 'concept_child', title: 'Child' }),
      makeConceptNode({ id: 'concept_grandchild', title: 'Grandchild' }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'concept_root', to: 'concept_child', type: 'broader_than', metadata: {} },
      { from: 'concept_child', to: 'concept_grandchild', type: 'broader_than', metadata: {} },
    ];
    currentGraph = makeGraph(nodes, edges);

    const tree = await getConceptTree('concept_root');

    expect(tree).toHaveLength(1);
    expect(tree[0].concept.id).toBe('concept_root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].concept.id).toBe('concept_child');
    expect(tree[0].children[0].children).toHaveLength(1);
    expect(tree[0].children[0].children[0].concept.id).toBe('concept_grandchild');
  });

  it('respects maxDepth', async () => {
    const nodes = [
      makeConceptNode({ id: 'concept_root', title: 'Root' }),
      makeConceptNode({ id: 'concept_l1', title: 'Level1' }),
      makeConceptNode({ id: 'concept_l2', title: 'Level2' }),
      makeConceptNode({ id: 'concept_l3', title: 'Level3' }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'concept_root', to: 'concept_l1', type: 'broader_than', metadata: {} },
      { from: 'concept_l1', to: 'concept_l2', type: 'broader_than', metadata: {} },
      { from: 'concept_l2', to: 'concept_l3', type: 'broader_than', metadata: {} },
    ];
    currentGraph = makeGraph(nodes, edges);

    const tree = await getConceptTree('concept_root', 1);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    // At maxDepth=1 the child should have no children (truncated)
    expect(tree[0].children[0].children).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  searchConcepts() tests                                             */
/* ------------------------------------------------------------------ */

describe('searchConcepts()', () => {
  it('finds via semantic search', async () => {
    const node = makeConceptNode({
      id: 'concept_agile',
      title: 'Agile',
      properties: {
        description: 'Agile methodology',
        domain: 'pm',
        facet: 'method',
        aliases: [],
        articleCount: 0,
        depth: 0,
      },
    });
    currentGraph = makeGraph([node]);

    mockSemanticSearch.mockResolvedValue([
      { id: 'concept_agile', title: 'Agile', similarity: 0.88 },
    ]);

    const results = await searchConcepts('agile');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: 'concept_agile',
      title: 'Agile',
      description: 'Agile methodology',
      facet: 'method',
      similarity: 0.88,
    });
    expect(mockSemanticSearch).toHaveBeenCalledWith('agile', expect.objectContaining({
      table: 'aurora_nodes',
      type: 'concept',
      minSimilarity: 0.3,
    }));
  });
});

/* ------------------------------------------------------------------ */
/*  linkArticleToConcepts() tests                                      */
/* ------------------------------------------------------------------ */

describe('linkArticleToConcepts()', () => {
  it('creates about edges', async () => {
    // semanticSearch first call: check existence => no match
    // semanticSearch second call (inside getOrCreateConcept): no match => create
    mockSemanticSearch.mockResolvedValue([]);

    const result = await linkArticleToConcepts('art-1', [
      { name: 'Agile' },
      { name: 'Scrum' },
    ]);

    expect(result.conceptsLinked).toBe(2);

    // Verify 'about' edges were created
    const aboutEdgeCalls = mockAddAuroraEdge.mock.calls.filter(
      (call: unknown[]) => (call[1] as AuroraEdge).type === 'about',
    );
    expect(aboutEdgeCalls).toHaveLength(2);
    expect(aboutEdgeCalls[0][1]).toMatchObject({
      from: 'art-1',
      type: 'about',
    });
  });

  it('creates new concepts if needed', async () => {
    mockSemanticSearch.mockResolvedValue([]);

    const result = await linkArticleToConcepts('art-1', [
      { name: 'NewConcept' },
    ]);

    expect(result.conceptsCreated).toBe(1);
    expect(mockAddAuroraNode).toHaveBeenCalled();
  });

  it('updates articleCount', async () => {
    mockSemanticSearch.mockResolvedValue([]);

    await linkArticleToConcepts('art-1', [{ name: 'Agile' }]);

    // Check that the saved graph has an incremented articleCount
    expect(mockSaveAuroraGraph).toHaveBeenCalled();
    const lastSave = mockSaveAuroraGraph.mock.calls[
      mockSaveAuroraGraph.mock.calls.length - 1
    ][0] as AuroraGraph;
    const conceptNode = lastSave.nodes.find((n) => n.type === 'concept');
    expect(conceptNode).toBeDefined();
    expect(conceptNode!.properties.articleCount).toBe(1);
  });

  it('handles legacy string[] format', async () => {
    mockSemanticSearch.mockResolvedValue([]);

    const result = await linkArticleToConcepts('art-1', ['Agile', 'Scrum']);

    expect(result.conceptsLinked).toBe(2);
    // Verify concepts were created with facet='topic' (the default for strings)
    const createdNodes = mockAddAuroraNode.mock.calls.map(
      (call: unknown[]) => call[1] as AuroraNode,
    );
    for (const node of createdNodes) {
      expect(node.properties.facet).toBe('topic');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  getOntologyStats() tests                                           */
/* ------------------------------------------------------------------ */

describe('getOntologyStats()', () => {
  it('returns correct statistics', async () => {
    const nodes = [
      makeConceptNode({
        id: 'concept_1',
        title: 'Agile',
        properties: { description: '', domain: 'pm', facet: 'method', aliases: [], articleCount: 5, depth: 0 },
      }),
      makeConceptNode({
        id: 'concept_2',
        title: 'Scrum',
        properties: { description: '', domain: 'pm', facet: 'method', aliases: [], articleCount: 3, depth: 1 },
      }),
      makeConceptNode({
        id: 'concept_3',
        title: 'TypeScript',
        properties: { description: '', domain: 'tech', facet: 'entity', aliases: [], articleCount: 10, depth: 0 },
      }),
      makeConceptNode({
        id: 'concept_orphan',
        title: 'Orphan',
        properties: { description: '', domain: 'general', facet: 'topic', aliases: [], articleCount: 0, depth: 0 },
      }),
    ];
    const edges: AuroraEdge[] = [
      { from: 'concept_1', to: 'concept_2', type: 'broader_than', metadata: {} },
    ];
    currentGraph = makeGraph(nodes, edges);

    const stats = await getOntologyStats();

    expect(stats.totalConcepts).toBe(4);
    expect(stats.maxDepth).toBe(1);
    expect(stats.orphanConcepts).toBe(2); // concept_3 and concept_orphan
    expect(stats.domains).toEqual({ pm: 2, tech: 1, general: 1 });
    expect(stats.facets).toEqual({ method: 2, entity: 1, topic: 1 });
    expect(stats.topConcepts[0].title).toBe('TypeScript'); // highest articleCount=10
    expect(stats.topConcepts[0].articleCount).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/*  suggestMerges() tests                                              */
/* ------------------------------------------------------------------ */

describe('suggestMerges()', () => {
  it('finds similar concept pairs', async () => {
    const nodes = [
      makeConceptNode({ id: 'concept_agile', title: 'Agile' }),
      makeConceptNode({ id: 'concept_agilmetodik', title: 'Agil Metodik' }),
    ];
    currentGraph = makeGraph(nodes);

    // For first concept "Agile", return "Agil Metodik" with similarity 0.82
    mockSemanticSearch
      .mockResolvedValueOnce([
        { id: 'concept_agile', title: 'Agile', similarity: 1.0 },
        { id: 'concept_agilmetodik', title: 'Agil Metodik', similarity: 0.82 },
      ])
      // For second concept "Agil Metodik", return "Agile" with similarity 0.82
      .mockResolvedValueOnce([
        { id: 'concept_agilmetodik', title: 'Agil Metodik', similarity: 1.0 },
        { id: 'concept_agile', title: 'Agile', similarity: 0.82 },
      ]);

    const suggestions = await suggestMerges();

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].similarity).toBe(0.82);
    expect(suggestions[0].suggestion).toContain('Agile');
    expect(suggestions[0].suggestion).toContain('Agil Metodik');
  });
});
