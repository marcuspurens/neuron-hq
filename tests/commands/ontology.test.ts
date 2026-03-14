import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock functions — defined at top level so they're available after vi.mock hoisting
const mockListConcepts = vi.fn();
const mockGetConceptTree = vi.fn();
const mockGetOntologyStats = vi.fn();
const mockSuggestMerges = vi.fn();

vi.mock('../../src/aurora/ontology.js', () => ({
  listConcepts: (...args: unknown[]) => mockListConcepts(...args),
  getConceptTree: (...args: unknown[]) => mockGetConceptTree(...args),
  getOntologyStats: (...args: unknown[]) => mockGetOntologyStats(...args),
  suggestMerges: (...args: unknown[]) => mockSuggestMerges(...args),
  getConcept: vi.fn(),
  searchConcepts: vi.fn(),
  getOrCreateConcept: vi.fn(),
  linkArticleToConcepts: vi.fn(),
}));

// Mock knowledge-library to avoid its own imports pulling in real modules
vi.mock('../../src/aurora/knowledge-library.js', () => ({
  listArticles: vi.fn(),
  searchArticles: vi.fn(),
  getArticle: vi.fn(),
  getArticleHistory: vi.fn(),
  importArticle: vi.fn(),
  synthesizeArticle: vi.fn(),
  refreshArticle: vi.fn(),
}));

import {
  libraryBrowseCommand,
  libraryConceptsCommand,
  libraryStatsCommand,
  libraryMergeSuggestionsCommand,
} from '../../src/commands/knowledge-library.js';

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

interface TestTreeNode {
  concept: ReturnType<typeof makeConcept>;
  children: TestTreeNode[];
  articles: Array<{ id: string; title: string }>;
}

function makeConcept(
  id: string,
  title: string,
  facet: string,
  articleCount = 0,
  depth = 0,
) {
  return {
    id,
    type: 'concept' as const,
    title,
    properties: {
      description: `Description of ${title}`,
      domain: 'general',
      facet,
      aliases: [],
      articleCount,
      depth,
    },
    confidence: 0.8,
    scope: 'personal',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  };
}

function makeTreeNode(
  concept: ReturnType<typeof makeConcept>,
  children: TestTreeNode[] = [],
  articles: Array<{ id: string; title: string }> = [],
): TestTreeNode {
  return { concept, children, articles };
}

// ---------------------------------------------------------------------------
//  Test suite
// ---------------------------------------------------------------------------

describe('ontology CLI commands', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Safe defaults
    mockListConcepts.mockResolvedValue([]);
    mockGetConceptTree.mockResolvedValue([]);
    mockGetOntologyStats.mockResolvedValue({
      totalConcepts: 0,
      maxDepth: 0,
      orphanConcepts: 0,
      domains: {},
      facets: {},
      topConcepts: [],
    });
    mockSuggestMerges.mockResolvedValue([]);
  });

  // -----------------------------------------------------------------------
  //  1. libraryBrowseCommand — grouped by facet
  // -----------------------------------------------------------------------
  it('libraryBrowseCommand shows tree grouped by facet', async () => {
    const topicConcept = makeConcept('c1', 'Machine Learning', 'topic', 3);
    const entityConcept = makeConcept('c2', 'OpenAI', 'entity', 1);
    const methodConcept = makeConcept('c3', 'Scrum', 'method', 2);

    mockListConcepts.mockResolvedValue([topicConcept, entityConcept, methodConcept]);
    mockGetConceptTree.mockResolvedValue([
      makeTreeNode(topicConcept),
      makeTreeNode(entityConcept),
      makeTreeNode(methodConcept),
    ]);

    await libraryBrowseCommand({});

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('TOPICS');
    expect(output).toContain('ENTITIES');
    expect(output).toContain('METHODS');
    expect(output).toContain('Machine Learning');
    expect(output).toContain('OpenAI');
    expect(output).toContain('Scrum');
  });

  // -----------------------------------------------------------------------
  //  2. libraryBrowseCommand --facet filters correctly
  // -----------------------------------------------------------------------
  it('libraryBrowseCommand --facet filters correctly', async () => {
    const topicConcept = makeConcept('c1', 'Machine Learning', 'topic', 3);
    const entityConcept = makeConcept('c2', 'OpenAI', 'entity', 1);

    mockListConcepts.mockResolvedValue([topicConcept, entityConcept]);
    mockGetConceptTree.mockResolvedValue([
      makeTreeNode(topicConcept),
      makeTreeNode(entityConcept),
    ]);

    await libraryBrowseCommand({ facet: 'entity' });

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('ENTITIES');
    expect(output).not.toContain('TOPICS');
    expect(output).toContain('OpenAI');
    expect(output).not.toContain('Machine Learning');
  });

  // -----------------------------------------------------------------------
  //  3. libraryConceptsCommand shows articles per concept
  // -----------------------------------------------------------------------
  it('libraryConceptsCommand shows articles per concept', async () => {
    const scrumConcept = makeConcept('c-scrum', 'Scrum', 'method', 2);
    const childConcept = makeConcept('c-sprint', 'Sprint Planning', 'method', 1);

    mockListConcepts.mockResolvedValue([scrumConcept, childConcept]);
    mockGetConceptTree.mockResolvedValue([
      makeTreeNode(
        scrumConcept,
        [makeTreeNode(childConcept)],
        [{ id: 'art-1', title: 'Scrum Fundamentals' }],
      ),
    ]);

    await libraryConceptsCommand('Scrum');

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Scrum');
    expect(output).toContain('Scrum Fundamentals');
    expect(output).toContain('Sprint Planning');
    expect(mockGetConceptTree).toHaveBeenCalledWith('c-scrum', 1);
  });

  // -----------------------------------------------------------------------
  //  4. libraryStatsCommand shows ontology stats with facets
  // -----------------------------------------------------------------------
  it('libraryStatsCommand shows ontology stats with facets', async () => {
    mockGetOntologyStats.mockResolvedValue({
      totalConcepts: 47,
      maxDepth: 4,
      orphanConcepts: 2,
      domains: { ai: 23, pm: 18 },
      facets: { topic: 25, entity: 12, method: 10 },
      topConcepts: [{ id: 'tc1', title: 'Agile', articleCount: 6 }],
    });

    await libraryStatsCommand();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('47');
    expect(output).toContain('4');
    expect(output).toContain('topic(25)');
    expect(output).toContain('entity(12)');
    expect(output).toContain('method(10)');
    expect(output).toContain('Agile');
  });

  // -----------------------------------------------------------------------
  //  5. libraryMergeSuggestionsCommand shows suggestions
  // -----------------------------------------------------------------------
  it('libraryMergeSuggestionsCommand shows suggestions', async () => {
    mockSuggestMerges.mockResolvedValue([
      {
        concept1: { id: 'c-pm', title: 'PM' },
        concept2: { id: 'c-proj-mgmt', title: 'Project Management' },
        similarity: 0.82,
        suggestion: 'Merge "PM" and "Project Management"?',
      },
    ]);

    await libraryMergeSuggestionsCommand();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Merge "PM" and "Project Management"?');
    expect(output).toContain('0.82');
  });

  // -----------------------------------------------------------------------
  //  6. libraryBrowseCommand handles concept subtree
  // -----------------------------------------------------------------------
  it('libraryBrowseCommand handles concept subtree', async () => {
    const agileConcept = makeConcept('c-agile', 'Agile', 'topic', 5);
    const kanbanConcept = makeConcept('c-kanban', 'Kanban', 'topic', 2);

    mockListConcepts.mockResolvedValue([agileConcept, kanbanConcept]);
    mockGetConceptTree.mockResolvedValue([
      makeTreeNode(agileConcept, [makeTreeNode(kanbanConcept)]),
    ]);

    await libraryBrowseCommand({ concept: 'Agile' });

    expect(mockGetConceptTree).toHaveBeenCalledWith('c-agile', 5);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Agile');
    expect(output).toContain('Kanban');
  });
});
