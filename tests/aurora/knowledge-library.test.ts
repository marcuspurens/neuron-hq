import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph, AuroraNode } from '../../src/aurora/aurora-schema.js';

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

const mockSearchAurora = vi.fn();
vi.mock('../../src/aurora/search.js', () => ({
  searchAurora: (...args: unknown[]) => mockSearchAurora(...args),
}));

const mockRecall = vi.fn();
vi.mock('../../src/aurora/memory.js', () => ({
  recall: (...args: unknown[]) => mockRecall(...args),
}));

const mockGetGaps = vi.fn();
vi.mock('../../src/aurora/knowledge-gaps.js', () => ({
  getGaps: (...args: unknown[]) => mockGetGaps(...args),
}));

const mockSemanticSearch = vi.fn();
vi.mock('../../src/core/semantic-search.js', () => ({
  semanticSearch: (...args: unknown[]) => mockSemanticSearch(...args),
}));

const mockCreate = vi.fn();
const mockCreateAgentClient = vi.fn(() => ({
  client: { messages: { create: mockCreate } },
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 8192,
}));
vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: (...args: unknown[]) => mockCreateAgentClient(...args),
}));

const mockLinkArticleToConcepts = vi.fn();
vi.mock('../../src/aurora/ontology.js', () => ({
  linkArticleToConcepts: (...args: unknown[]) => mockLinkArticleToConcepts(...args),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: () => ({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 8192,
  }),
  DEFAULT_MODEL_CONFIG: {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxTokens: 8192,
  },
}));

// Mock fs/promises for prompt template reading in synthesizeArticle
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockResolvedValue('Prompt template: {{sources}}\n\nGaps: {{gaps}}'),
  },
}));

import {
  createArticle,
  getArticle,
  listArticles,
  searchArticles,
  getArticleHistory,
  updateArticle,
  importArticle,
  synthesizeArticle,
  refreshArticle,
  countWords,
  parseJsonBlock,
  contentDiffers,
} from '../../src/aurora/knowledge-library.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGraph(nodes: AuroraNode[] = [], edges: AuroraGraph['edges'] = []): AuroraGraph {
  return { nodes, edges, lastUpdated: new Date().toISOString() };
}

function makeArticleNode(overrides: Partial<AuroraNode> = {}): AuroraNode {
  return {
    id: 'art-1',
    type: 'article',
    title: 'Test Article',
    properties: {
      content: 'Article content here',
      domain: 'tech',
      tags: ['typescript'],
      concepts: ['TypeScript'],
      version: 1,
      previousVersionId: null,
      sourceNodeIds: [],
      synthesizedBy: 'test',
      synthesisModel: 'test-model',
      wordCount: 3,
      abstract: 'Article content here',
    },
    confidence: 0.8,
    scope: 'personal',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Standard LLM response with JSON metadata block for synthesizeArticle tests. */
function makeLLMResponse(content?: string) {
  const text = content ?? [
    '# Test Article',
    '',
    'This is an article about testing.',
    '',
    '## Details',
    '',
    'Some details here about testing frameworks and methodologies.',
    '',
    '```json',
    '{',
    '  "abstract": "An article about testing",',
    '  "concepts": [',
    '    { "name": "Testing", "facet": "topic", "broaderConcept": "Software Engineering" },',
    '    { "name": "Frameworks", "facet": "tool", "broaderConcept": "Testing" },',
    '    { "name": "Methodology", "facet": "method", "broaderConcept": null }',
    '  ]',
    '}',
    '```',
  ].join('\n');

  return {
    content: [{ type: 'text', text }],
  };
}

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  const emptyGraph = makeGraph();
  mockLoadAuroraGraph.mockResolvedValue(emptyGraph);
  mockSaveAuroraGraph.mockResolvedValue(undefined);
  mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
  mockSearchAurora.mockResolvedValue([]);
  mockRecall.mockResolvedValue({ memories: [], totalFound: 0 });
  mockGetGaps.mockResolvedValue({ gaps: [], totalUnanswered: 0 });
  mockSemanticSearch.mockResolvedValue([]);
  mockCreate.mockResolvedValue(makeLLMResponse());
  mockLinkArticleToConcepts.mockResolvedValue({ conceptsLinked: 0, conceptsCreated: 0 });

  // addAuroraNode / addAuroraEdge: return updated graph with the new node/edge
  mockAddAuroraNode.mockImplementation((graph: AuroraGraph, node: AuroraNode) => ({
    ...graph,
    nodes: [...graph.nodes, node],
    lastUpdated: new Date().toISOString(),
  }));
  mockAddAuroraEdge.mockImplementation((graph: AuroraGraph, edge: AuroraGraph['edges'][0]) => ({
    ...graph,
    edges: [...graph.edges, edge],
    lastUpdated: new Date().toISOString(),
  }));
});

/* ------------------------------------------------------------------ */
/*  Helper function tests                                              */
/* ------------------------------------------------------------------ */

describe('countWords()', () => {
  it('counts words in a simple string', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('handles extra whitespace', () => {
    expect(countWords('  hello   world  ')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });
});

describe('parseJsonBlock()', () => {
  it('extracts JSON from a code block', () => {
    const text = 'Some text\n```json\n{"key": "value"}\n```\nMore text';
    expect(parseJsonBlock(text)).toEqual({ key: 'value' });
  });

  it('returns last JSON block when multiple exist', () => {
    const text = '```json\n{"first": true}\n```\n```json\n{"second": true}\n```';
    expect(parseJsonBlock(text)).toEqual({ second: true });
  });

  it('returns null when no JSON block', () => {
    expect(parseJsonBlock('No JSON here')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonBlock('```json\n{invalid}\n```')).toBeNull();
  });
});

describe('contentDiffers()', () => {
  it('returns false for identical content', () => {
    expect(contentDiffers('hello world', 'hello world')).toBe(false);
  });

  it('returns true for very different content', () => {
    expect(contentDiffers('hello world', 'completely different text here now')).toBe(true);
  });

  it('returns true when length differs by more than 10%', () => {
    const short = 'abc';
    const long = 'abcdefghijklmnop';
    expect(contentDiffers(short, long)).toBe(true);
  });

  it('returns false for empty strings', () => {
    expect(contentDiffers('', '')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  createArticle() tests                                              */
/* ------------------------------------------------------------------ */

describe('createArticle()', () => {
  it('creates an article node with correct properties', async () => {
    const article = await createArticle({
      title: 'My Article',
      content: 'This is the article content with several words.',
      domain: 'tech',
      tags: ['ts', 'node'],
      synthesizedBy: 'test',
      synthesisModel: 'claude-haiku-4-5-20251001',
    });

    expect(article.type).toBe('article');
    expect(article.title).toBe('My Article');
    expect(article.properties.domain).toBe('tech');
    expect(article.properties.tags).toEqual(['ts', 'node']);
    expect(article.properties.version).toBe(1);
    expect(article.properties.previousVersionId).toBeNull();
    expect(article.properties.wordCount).toBe(8);
    expect(article.confidence).toBe(0.8);
    expect(mockAddAuroraNode).toHaveBeenCalledOnce();
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('creates summarizes edges for source nodes', async () => {
    const sourceNode = makeArticleNode({ id: 'src-1', type: 'document' as 'article' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([sourceNode]));

    mockAddAuroraNode.mockImplementation((graph: AuroraGraph, node: AuroraNode) => ({
      ...graph,
      nodes: [...graph.nodes, node],
      lastUpdated: new Date().toISOString(),
    }));

    await createArticle({
      title: 'Summary',
      content: 'Summarized content',
      domain: 'tech',
      sourceNodeIds: ['src-1'],
      synthesizedBy: 'test',
      synthesisModel: 'test-model',
    });

    expect(mockAddAuroraEdge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: 'src-1', type: 'summarizes' }),
    );
  });

  it('uses first 200 chars as abstract when not provided', async () => {
    const content = 'A'.repeat(300);
    const article = await createArticle({
      title: 'Long',
      content,
      domain: 'tech',
      synthesizedBy: 'test',
      synthesisModel: 'test-model',
    });

    expect(article.properties.abstract).toBe('A'.repeat(200));
  });

  it('calls autoEmbedAuroraNodes', async () => {
    await createArticle({
      title: 'Embed test',
      content: 'Content',
      domain: 'tech',
      synthesizedBy: 'test',
      synthesisModel: 'model',
    });

    expect(mockAutoEmbedAuroraNodes).toHaveBeenCalledOnce();
  });

  it('does not throw when embedding fails', async () => {
    mockAutoEmbedAuroraNodes.mockRejectedValue(new Error('embed failed'));

    const article = await createArticle({
      title: 'Embed fail',
      content: 'Content',
      domain: 'tech',
      synthesizedBy: 'test',
      synthesisModel: 'model',
    });

    expect(article.type).toBe('article');
  });
});

/* ------------------------------------------------------------------ */
/*  getArticle() tests                                                 */
/* ------------------------------------------------------------------ */

describe('getArticle()', () => {
  it('returns article node when found', async () => {
    const node = makeArticleNode({ id: 'art-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));

    const result = await getArticle('art-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('art-1');
    expect(result!.type).toBe('article');
  });

  it('returns null when not found', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph());

    const result = await getArticle('nonexistent');

    expect(result).toBeNull();
  });

  it('returns null for non-article nodes', async () => {
    const node: AuroraNode = {
      ...makeArticleNode(),
      type: 'fact',
    };
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));

    const result = await getArticle('art-1');

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  listArticles() tests                                               */
/* ------------------------------------------------------------------ */

describe('listArticles()', () => {
  it('returns all current articles', async () => {
    const nodes = [
      makeArticleNode({ id: 'art-1', updated: '2026-01-02T00:00:00.000Z' }),
      makeArticleNode({ id: 'art-2', updated: '2026-01-03T00:00:00.000Z' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await listArticles();

    expect(result).toHaveLength(2);
    // Sorted by updated desc
    expect(result[0].id).toBe('art-2');
    expect(result[1].id).toBe('art-1');
  });

  it('excludes superseded articles by default', async () => {
    const nodes = [
      makeArticleNode({ id: 'old-1' }),
      makeArticleNode({ id: 'new-1' }),
    ];
    const edges = [
      { from: 'new-1', to: 'old-1', type: 'supersedes' as const, metadata: {} },
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes, edges));

    const result = await listArticles();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new-1');
  });

  it('includes superseded articles when option is set', async () => {
    const nodes = [
      makeArticleNode({ id: 'old-1' }),
      makeArticleNode({ id: 'new-1' }),
    ];
    const edges = [
      { from: 'new-1', to: 'old-1', type: 'supersedes' as const, metadata: {} },
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes, edges));

    const result = await listArticles({ includeOldVersions: true });

    expect(result).toHaveLength(2);
  });

  it('filters by domain', async () => {
    const nodes = [
      makeArticleNode({ id: 'art-1', properties: { ...makeArticleNode().properties, domain: 'tech' } }),
      makeArticleNode({ id: 'art-2', properties: { ...makeArticleNode().properties, domain: 'science' } }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await listArticles({ domain: 'tech' });

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('tech');
  });

  it('filters by tags (must have ALL)', async () => {
    const nodes = [
      makeArticleNode({
        id: 'art-1',
        properties: { ...makeArticleNode().properties, tags: ['ts', 'node'] },
      }),
      makeArticleNode({
        id: 'art-2',
        properties: { ...makeArticleNode().properties, tags: ['ts'] },
      }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await listArticles({ tags: ['ts', 'node'] });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('art-1');
  });

  it('respects limit', async () => {
    const nodes = [
      makeArticleNode({ id: 'art-1' }),
      makeArticleNode({ id: 'art-2' }),
      makeArticleNode({ id: 'art-3' }),
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph(nodes));

    const result = await listArticles({ limit: 2 });

    expect(result).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  searchArticles() tests                                             */
/* ------------------------------------------------------------------ */

describe('searchArticles()', () => {
  it('returns search results with article properties', async () => {
    const node = makeArticleNode({ id: 'art-1' });
    mockSemanticSearch.mockResolvedValue([
      { id: 'art-1', title: 'Test', type: 'article', similarity: 0.9, confidence: 0.8, scope: 'personal' },
    ]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));

    const results = await searchArticles('typescript');

    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBe(0.9);
    expect(results[0].abstract).toBe('Article content here');
  });

  it('passes options to semanticSearch', async () => {
    mockSemanticSearch.mockResolvedValue([]);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph());

    await searchArticles('query', { limit: 5, minSimilarity: 0.5 });

    expect(mockSemanticSearch).toHaveBeenCalledWith('query', {
      table: 'aurora_nodes',
      type: 'article',
      limit: 5,
      minSimilarity: 0.5,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  getArticleHistory() tests                                          */
/* ------------------------------------------------------------------ */

describe('getArticleHistory()', () => {
  it('returns version chain newest first', async () => {
    const v1 = makeArticleNode({
      id: 'v1',
      properties: { ...makeArticleNode().properties, version: 1, previousVersionId: null },
    });
    const v2 = makeArticleNode({
      id: 'v2',
      properties: { ...makeArticleNode().properties, version: 2, previousVersionId: 'v1' },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([v1, v2]));

    const history = await getArticleHistory('v2');

    expect(history).toHaveLength(2);
    expect(history[0].id).toBe('v2');
    expect(history[1].id).toBe('v1');
  });

  it('returns empty array for non-existent article', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph());

    const history = await getArticleHistory('nonexistent');

    expect(history).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  updateArticle() tests                                              */
/* ------------------------------------------------------------------ */

describe('updateArticle()', () => {
  it('creates new version and supersedes edge', async () => {
    const oldNode = makeArticleNode({ id: 'old-1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([oldNode]));

    const newArticle = await updateArticle('old-1', {
      content: 'Updated content',
      synthesizedBy: 'test',
      synthesisModel: 'model',
    });

    expect(newArticle.properties.version).toBe(2);
    expect(newArticle.properties.previousVersionId).toBe('old-1');

    // Check supersedes edge was created
    expect(mockAddAuroraEdge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: 'old-1', type: 'supersedes' }),
    );
  });

  it('throws when article not found', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph());

    await expect(updateArticle('nonexistent', {
      content: 'New',
      synthesizedBy: 'test',
      synthesisModel: 'model',
    })).rejects.toThrow('Article not found');
  });
});

/* ------------------------------------------------------------------ */
/*  importArticle() tests                                              */
/* ------------------------------------------------------------------ */

describe('importArticle()', () => {
  it('creates article with manual-import metadata', async () => {
    const article = await importArticle({
      title: 'Imported Article',
      content: 'Imported content',
      domain: 'science',
    });

    expect(article.properties.synthesizedBy).toBe('manual-import');
    expect(article.properties.synthesisModel).toBe('none');
  });

  it('searches for matching documents when sourceUrl provided', async () => {
    mockSearchAurora.mockResolvedValue([
      { id: 'doc-1', title: 'Doc', type: 'document', similarity: 0.9, confidence: 0.8, scope: 'personal', source: 'semantic' },
    ]);

    const article = await importArticle({
      title: 'With Source',
      content: 'Content',
      domain: 'tech',
      sourceUrl: 'https://example.com/article',
    });

    expect(mockSearchAurora).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.objectContaining({ type: 'document' }),
    );
    expect(article.properties.sourceNodeIds).toContain('doc-1');
  });
});

/* ------------------------------------------------------------------ */
/*  synthesizeArticle() tests                                          */
/* ------------------------------------------------------------------ */

describe('synthesizeArticle()', () => {
  it('calls LLM and parses concepts from response', async () => {
    mockRecall.mockResolvedValue({
      memories: [
        { id: 'mem-1', title: 'Fact 1', type: 'fact', text: 'Some fact', confidence: 0.8, scope: 'personal', tags: [], similarity: 0.9, related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      totalFound: 1,
    });

    const article = await synthesizeArticle('Testing');

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(article.type).toBe('article');
    expect(article.properties.concepts).toEqual(['Testing', 'Frameworks', 'Methodology']);
    expect(article.properties.synthesizedBy).toBe('synthesize');
  });

  it('creates summarizes edges to source nodes', async () => {
    const sourceNode = makeArticleNode({ id: 'mem-1', type: 'fact' as 'article' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([sourceNode]));

    mockRecall.mockResolvedValue({
      memories: [
        { id: 'mem-1', title: 'Fact 1', type: 'fact', text: 'Some fact', confidence: 0.8, scope: 'personal', tags: [], similarity: 0.9, related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      totalFound: 1,
    });

    mockAddAuroraNode.mockImplementation((graph: AuroraGraph, node: AuroraNode) => ({
      ...graph,
      nodes: [...graph.nodes, node],
      lastUpdated: new Date().toISOString(),
    }));

    await synthesizeArticle('Testing');

    expect(mockAddAuroraEdge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: 'mem-1', type: 'summarizes' }),
    );
  });

  it('calls linkArticleToConcepts after synthesis', async () => {
    await synthesizeArticle('Testing');

    expect(mockLinkArticleToConcepts).toHaveBeenCalledWith(
      expect.any(String), // articleId
      expect.arrayContaining([
        expect.objectContaining({ name: 'Testing' }),
      ]),
    );
  });

  it('handles LLM response without JSON block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '# Simple Article\n\nJust plain markdown without JSON.' }],
    });

    const article = await synthesizeArticle('Plain Topic');

    expect(article.type).toBe('article');
    expect(article.properties.concepts).toEqual([]);
    expect(article.properties.abstract).toBe('# Simple Article\n\nJust plain markdown without JSON.'.slice(0, 200));
  });

  it('passes domain and tags from options', async () => {
    const article = await synthesizeArticle('Testing', {
      domain: 'engineering',
      tags: ['ci', 'automation'],
    });

    expect(article.properties.domain).toBe('engineering');
    expect(article.properties.tags).toEqual(['ci', 'automation']);
  });

  it('gathers sources from recall and search in parallel', async () => {
    mockRecall.mockResolvedValue({
      memories: [
        { id: 'mem-1', title: 'Fact', type: 'fact', text: 'text', confidence: 0.8, scope: 'personal', tags: [], similarity: 0.9, related: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
      totalFound: 1,
    });
    mockSearchAurora.mockResolvedValue([
      { id: 'doc-1', title: 'Doc', type: 'document', similarity: 0.85, confidence: 0.9, scope: 'shared', source: 'semantic' },
    ]);

    const article = await synthesizeArticle('Testing');

    expect(mockRecall).toHaveBeenCalledOnce();
    expect(mockSearchAurora).toHaveBeenCalledOnce();
    expect(mockGetGaps).toHaveBeenCalledOnce();
    expect(article.properties.sourceNodeIds).toContain('mem-1');
    expect(article.properties.sourceNodeIds).toContain('doc-1');
  });

  it('handles source-gathering failures gracefully', async () => {
    mockRecall.mockRejectedValue(new Error('recall failed'));
    mockSearchAurora.mockRejectedValue(new Error('search failed'));
    mockGetGaps.mockRejectedValue(new Error('gaps failed'));

    const article = await synthesizeArticle('Failing Topic');

    expect(article.type).toBe('article');
    expect(article.properties.sourceNodeIds).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  refreshArticle() tests                                             */
/* ------------------------------------------------------------------ */

describe('refreshArticle()', () => {
  it('creates new version if content changed', async () => {
    const existingNode = makeArticleNode({
      id: 'existing-1',
      properties: {
        ...makeArticleNode().properties,
        content: 'Old content that is very different from new synthesis',
      },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingNode]));

    // The LLM will return substantially different content
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '# Completely New Content\n\nThis is entirely different material about a new topic with fresh insights and perspectives that differ substantially.\n\n```json\n{"abstract": "New abstract", "concepts": [{"name": "New", "facet": "topic", "broaderConcept": null}]}\n```',
      }],
    });

    const result = await refreshArticle('existing-1');

    // updateArticle creates a new version, so version should be 2
    expect(result.properties.version).toBe(2);
    expect(result.properties.previousVersionId).toBe('existing-1');
  });

  it('returns existing article if content approximately same', async () => {
    // Create content that will match the LLM output closely
    const llmText = '# Test Article\n\nThis is an article about testing.\n\n## Details\n\nSome details here about testing frameworks and methodologies.';
    const existingNode = makeArticleNode({
      id: 'existing-2',
      properties: {
        ...makeArticleNode().properties,
        content: llmText,
      },
    });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([existingNode]));

    // LLM returns very similar content
    mockCreate.mockResolvedValue(makeLLMResponse());

    const result = await refreshArticle('existing-2');

    // Should return the existing node since content is similar
    expect(result.id).toBe('existing-2');
  });

  it('throws when article not found', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph());

    await expect(refreshArticle('nonexistent')).rejects.toThrow('Article not found');
  });
});
