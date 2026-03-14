import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock functions — defined at top level so they're available after vi.mock hoisting
const mockListArticles = vi.fn();
const mockSearchArticles = vi.fn();
const mockGetArticle = vi.fn();
const mockGetArticleHistory = vi.fn();
const mockImportArticle = vi.fn();
const mockSynthesizeArticle = vi.fn();
const mockRefreshArticle = vi.fn();

vi.mock('../../src/aurora/knowledge-library.js', () => ({
  listArticles: (...args: unknown[]) => mockListArticles(...args),
  searchArticles: (...args: unknown[]) => mockSearchArticles(...args),
  getArticle: (...args: unknown[]) => mockGetArticle(...args),
  getArticleHistory: (...args: unknown[]) => mockGetArticleHistory(...args),
  importArticle: (...args: unknown[]) => mockImportArticle(...args),
  synthesizeArticle: (...args: unknown[]) => mockSynthesizeArticle(...args),
  refreshArticle: (...args: unknown[]) => mockRefreshArticle(...args),
}));

// Mock fs/promises for import command — must handle both default and named exports
const mockReadFile = vi.fn();
vi.mock('fs/promises', async (importOriginal) => {
  const orig = await importOriginal<typeof import('fs/promises')>();
  const mocked = {
    ...orig,
    readFile: (...args: unknown[]) => mockReadFile(...args),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

import {
  libraryListCommand,
  librarySearchCommand,
  libraryReadCommand,
  libraryHistoryCommand,
  libraryImportCommand,
  librarySynthesizeCommand,
  libraryRefreshCommand,
} from '../../src/commands/knowledge-library.js';

describe('knowledge-library CLI commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set default resolved values
    mockListArticles.mockResolvedValue([]);
    mockSearchArticles.mockResolvedValue([]);
    mockGetArticle.mockResolvedValue(null);
    mockGetArticleHistory.mockResolvedValue([]);
    mockReadFile.mockResolvedValue('# Test\n\nContent here');
    mockImportArticle.mockResolvedValue({
      id: 'test-id',
      title: 'Test',
      type: 'article',
      properties: {
        content: 'test',
        domain: 'ai',
        version: 1,
        abstract: 'test',
        tags: [],
        concepts: [],
        sourceNodeIds: [],
        synthesizedBy: 'manual-import',
        synthesisModel: 'none',
        wordCount: 1,
        previousVersionId: null,
      },
      confidence: 0.8,
      scope: 'personal',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    mockSynthesizeArticle.mockResolvedValue({
      id: 'synth-id',
      title: 'Synthesized',
      type: 'article',
      properties: {
        content: 'synthesized',
        domain: 'ai',
        version: 1,
        abstract: 'synth',
        tags: [],
        concepts: ['AI'],
        sourceNodeIds: [],
        synthesizedBy: 'km-auto',
        synthesisModel: 'claude-haiku-4-5-20251001',
        wordCount: 1,
        previousVersionId: null,
      },
      confidence: 0.8,
      scope: 'personal',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
    mockRefreshArticle.mockResolvedValue({
      id: 'refresh-id',
      title: 'Refreshed',
      type: 'article',
      properties: {
        content: 'refreshed',
        domain: 'ai',
        version: 2,
        abstract: 'refresh',
        tags: [],
        concepts: [],
        sourceNodeIds: [],
        synthesizedBy: 'km-auto',
        synthesisModel: 'claude-haiku-4-5-20251001',
        wordCount: 1,
        previousVersionId: 'old-id',
      },
      confidence: 0.8,
      scope: 'personal',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
  });

  it('list command calls listArticles', async () => {
    await libraryListCommand({});
    expect(mockListArticles).toHaveBeenCalled();
  });

  it('list command passes domain filter', async () => {
    await libraryListCommand({ domain: 'ai' });
    expect(mockListArticles).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'ai' }),
    );
  });

  it('search command calls searchArticles', async () => {
    await librarySearchCommand('test query', {});
    expect(mockSearchArticles).toHaveBeenCalledWith(
      'test query',
      expect.any(Object),
    );
  });

  it('import command calls importArticle', async () => {
    await libraryImportCommand('test.md', { domain: 'pm' });
    expect(mockImportArticle).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'pm' }),
    );
  });

  it('synthesize command calls synthesizeArticle', async () => {
    await librarySynthesizeCommand('AI testing', {});
    expect(mockSynthesizeArticle).toHaveBeenCalledWith(
      'AI testing',
      expect.any(Object),
    );
  });

  it('read command calls getArticle', async () => {
    await libraryReadCommand('test-id');
    expect(mockGetArticle).toHaveBeenCalledWith('test-id');
  });

  it('history command calls getArticleHistory', async () => {
    await libraryHistoryCommand('test-id');
    expect(mockGetArticleHistory).toHaveBeenCalledWith('test-id');
  });

  it('refresh command calls refreshArticle', async () => {
    await libraryRefreshCommand('test-id');
    expect(mockRefreshArticle).toHaveBeenCalledWith('test-id');
  });
});
