import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  loadAuroraGraph,
  saveAuroraGraph,
  addAuroraNode,
  addAuroraEdge,

  autoEmbedAuroraNodes,
} from './aurora-graph.js';
import { searchAurora } from './search.js';
import { recall } from './memory.js';
import { getGaps } from './knowledge-gaps.js';
import type { AuroraNode } from './aurora-schema.js';
import { createAgentClient } from '../core/agent-client.js';
import {
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from '../core/model-registry.js';
import { semanticSearch } from '../core/semantic-search.js';
import type Anthropic from '@anthropic-ai/sdk';
import { linkArticleToConcepts } from './ontology.js';

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------

export interface ArticleProperties {
  content: string;
  domain: string;
  tags: string[];
  concepts: string[];
  version: number;
  previousVersionId: string | null;
  sourceNodeIds: string[];
  synthesizedBy: string;
  synthesisModel: string;
  wordCount: number;
  abstract: string;
}

export interface ArticleNode extends AuroraNode {
  type: 'article';
  properties: ArticleProperties & Record<string, unknown>;
}

export interface ArticleSummary {
  id: string;
  title: string;
  abstract: string;
  domain: string;
  tags: string[];
  version: number;
  confidence: number;
  updated: string;
}

export interface ArticleSearchResult {
  id: string;
  title: string;
  abstract: string;
  domain: string;
  similarity: number;
  confidence: number;
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Count words in a text string. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Extract the last JSON code block from text. Returns parsed object or null. */
export function parseJsonBlock(text: string): Record<string, unknown> | null {
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (blocks.length === 0) return null;
  const last = blocks[blocks.length - 1][1].trim();
  try {
    return JSON.parse(last) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Check if two content strings differ substantially (>10% length or >20% word diff). */
export function contentDiffers(a: string, b: string): boolean {
  const lenA = a.length;
  const lenB = b.length;
  const maxLen = Math.max(lenA, lenB);
  if (maxLen === 0) return false;

  // Length difference check (>10%)
  if (Math.abs(lenA - lenB) / maxLen > 0.1) return true;

  // Word-level difference check (>20%)
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  const union = new Set([...wordsA, ...wordsB]);
  if (union.size === 0) return false;

  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared++;
  }
  const diffRatio = 1 - shared / union.size;
  return diffRatio > 0.2;
}

/** Cast an AuroraNode to ArticleNode if it is an article, or return null. */
function asArticleNode(node: AuroraNode | undefined): ArticleNode | null {
  if (!node || node.type !== 'article') return null;
  return node as ArticleNode;
}

/** Build an ArticleSummary from an ArticleNode. */
function toSummary(node: ArticleNode): ArticleSummary {
  const props = node.properties;
  return {
    id: node.id,
    title: node.title,
    abstract: (props.abstract as string) ?? '',
    domain: (props.domain as string) ?? '',
    tags: Array.isArray(props.tags) ? (props.tags as string[]) : [],
    version: typeof props.version === 'number' ? props.version : 1,
    confidence: node.confidence,
    updated: node.updated,
  };
}

/** Get a cheap model config for article synthesis. */
function getSynthesisModelConfig(modelOverride?: string): ModelConfig {
  if (modelOverride) {
    return { ...DEFAULT_MODEL_CONFIG, model: modelOverride };
  }
  try {
    return resolveModelConfig('librarian');
  } catch {
    return { ...DEFAULT_MODEL_CONFIG, model: 'claude-haiku-4-5-20251001' };
  }
}

// ---------------------------------------------------------------------------
//  Core Functions
// ---------------------------------------------------------------------------

/**
 * Create a new article node in the Aurora knowledge graph.
 */
export async function createArticle(input: {
  title: string;
  content: string;
  domain: string;
  tags?: string[];
  concepts?: string[];
  sourceNodeIds?: string[];
  synthesizedBy: string;
  synthesisModel: string;
  abstract?: string;
}): Promise<ArticleNode> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const content = input.content;
  const abstract = input.abstract ?? content.slice(0, 200);

  const node: AuroraNode = {
    id,
    type: 'article',
    title: input.title,
    properties: {
      content,
      domain: input.domain,
      tags: input.tags ?? [],
      concepts: input.concepts ?? [],
      version: 1,
      previousVersionId: null,
      sourceNodeIds: input.sourceNodeIds ?? [],
      synthesizedBy: input.synthesizedBy,
      synthesisModel: input.synthesisModel,
      wordCount: countWords(content),
      abstract,
    },
    confidence: 0.8,
    scope: 'personal',
    created: now,
    updated: now,
  };

  let graph = await loadAuroraGraph();
  graph = addAuroraNode(graph, node);

  // Create 'summarizes' edges to each source node
  const sourceIds = input.sourceNodeIds ?? [];
  for (const srcId of sourceIds) {
    // Only create edge if target node exists
    if (graph.nodes.some((n) => n.id === srcId)) {
      graph = addAuroraEdge(graph, {
        from: id,
        to: srcId,
        type: 'summarizes',
        metadata: { createdBy: 'knowledge-library', timestamp: now },
      });
    }
  }

  await saveAuroraGraph(graph);

  // Auto-embed (non-fatal)
  try {
    await autoEmbedAuroraNodes([id]);
  } catch {
    // Embedding failure is non-fatal
  }

  return node as ArticleNode;
}

/**
 * Get a single article by ID. Returns null if not found.
 */
export async function getArticle(articleId: string): Promise<ArticleNode | null> {
  const graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === articleId);
  return asArticleNode(node);
}

/**
 * List articles with optional filtering. Excludes superseded versions by default.
 */
export async function listArticles(options?: {
  domain?: string;
  tags?: string[];
  includeOldVersions?: boolean;
  limit?: number;
}): Promise<ArticleSummary[]> {
  const graph = await loadAuroraGraph();
  const includeOld = options?.includeOldVersions ?? false;

  // Find IDs of nodes that have been superseded (a 'supersedes' edge points TO them)
  const supersededIds = new Set<string>();
  if (!includeOld) {
    for (const edge of graph.edges) {
      if (edge.type === 'supersedes') {
        supersededIds.add(edge.to);
      }
    }
  }

  let articles = graph.nodes
    .filter((n): n is ArticleNode => n.type === 'article')
    .filter((n) => !supersededIds.has(n.id));

  // Filter by domain
  if (options?.domain) {
    articles = articles.filter((n) => n.properties.domain === options.domain);
  }

  // Filter by tags (article must have ALL specified tags)
  if (options?.tags && options.tags.length > 0) {
    const requiredTags = options.tags;
    articles = articles.filter((n) => {
      const articleTags = Array.isArray(n.properties.tags)
        ? (n.properties.tags as string[])
        : [];
      return requiredTags.every((t) => articleTags.includes(t));
    });
  }

  // Map to summary, sort by updated desc, apply limit
  const summaries = articles.map(toSummary);
  summaries.sort((a, b) => b.updated.localeCompare(a.updated));

  const limit = options?.limit ?? summaries.length;
  return summaries.slice(0, limit);
}

/**
 * Search articles using semantic similarity.
 */
export async function searchArticles(
  query: string,
  options?: { limit?: number; minSimilarity?: number },
): Promise<ArticleSearchResult[]> {
  const limit = options?.limit ?? 10;
  const minSimilarity = options?.minSimilarity ?? 0.3;

  const results = await semanticSearch(query, {
    table: 'aurora_nodes',
    type: 'article',
    limit,
    minSimilarity,
  });

  // Load graph for full properties
  const graph = await loadAuroraGraph();

  return results.map((r) => {
    const node = graph.nodes.find((n) => n.id === r.id);
    const props = node?.properties ?? {};
    return {
      id: r.id,
      title: r.title,
      abstract: (props.abstract as string) ?? '',
      domain: (props.domain as string) ?? '',
      similarity: r.similarity,
      confidence: r.confidence,
    };
  });
}

/**
 * Get the version history of an article (newest first).
 */
export async function getArticleHistory(articleId: string): Promise<ArticleNode[]> {
  const graph = await loadAuroraGraph();
  const history: ArticleNode[] = [];

  let currentId: string | null = articleId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = graph.nodes.find((n) => n.id === currentId);
    const article = asArticleNode(node);
    if (!article) break;

    history.push(article);
    currentId = (article.properties.previousVersionId as string) ?? null;
  }

  return history;
}

/**
 * Update an article, creating a new version. Lowers confidence on old version.
 */
export async function updateArticle(
  articleId: string,
  updates: {
    title?: string;
    content: string;
    domain?: string;
    tags?: string[];
    concepts?: string[];
    sourceNodeIds?: string[];
    synthesizedBy: string;
    synthesisModel: string;
    abstract?: string;
  },
): Promise<ArticleNode> {
  const oldArticle = await getArticle(articleId);
  if (!oldArticle) {
    throw new Error(`Article not found: ${articleId}`);
  }

  const now = new Date().toISOString();
  const newId = crypto.randomUUID();
  const content = updates.content;
  const abstract = updates.abstract ?? content.slice(0, 200);
  const oldProps = oldArticle.properties;

  const newNode: AuroraNode = {
    id: newId,
    type: 'article',
    title: updates.title ?? oldArticle.title,
    properties: {
      content,
      domain: updates.domain ?? oldProps.domain,
      tags: updates.tags ?? oldProps.tags,
      concepts: updates.concepts ?? oldProps.concepts,
      version: (typeof oldProps.version === 'number' ? oldProps.version : 1) + 1,
      previousVersionId: articleId,
      sourceNodeIds: updates.sourceNodeIds ?? oldProps.sourceNodeIds,
      synthesizedBy: updates.synthesizedBy,
      synthesisModel: updates.synthesisModel,
      wordCount: countWords(content),
      abstract,
    },
    confidence: 0.8,
    scope: oldArticle.scope,
    created: now,
    updated: now,
  };

  let graph = await loadAuroraGraph();
  graph = addAuroraNode(graph, newNode);

  // Create 'supersedes' edge from new → old
  graph = addAuroraEdge(graph, {
    from: newId,
    to: articleId,
    type: 'supersedes',
    metadata: { createdBy: 'knowledge-library', timestamp: now },
  });

  // Create 'summarizes' edges for new node
  const srcIds = updates.sourceNodeIds ?? (oldProps.sourceNodeIds as string[]) ?? [];
  for (const srcId of srcIds) {
    if (graph.nodes.some((n) => n.id === srcId)) {
      graph = addAuroraEdge(graph, {
        from: newId,
        to: srcId,
        type: 'summarizes',
        metadata: { createdBy: 'knowledge-library', timestamp: now },
      });
    }
  }

  // Lower old node confidence
  const oldIdx = graph.nodes.findIndex((n) => n.id === articleId);
  if (oldIdx !== -1) {
    const oldNode = graph.nodes[oldIdx];
    const nodes = [...graph.nodes];
    nodes[oldIdx] = { ...oldNode, confidence: 0.3, updated: now };
    graph = { ...graph, nodes, lastUpdated: now };
  }

  await saveAuroraGraph(graph);

  // Auto-embed new node (non-fatal)
  try {
    await autoEmbedAuroraNodes([newId]);
  } catch {
    // Embedding failure is non-fatal
  }

  return newNode as ArticleNode;
}

/**
 * Import an externally-written article into the knowledge library.
 */
export async function importArticle(input: {
  title: string;
  content: string;
  domain: string;
  tags?: string[];
  concepts?: string[];
  sourceUrl?: string;
  sourceNodeIds?: string[];
}): Promise<ArticleNode> {
  // If sourceUrl provided, try to find matching document nodes
  let sourceNodeIds = input.sourceNodeIds ?? [];
  if (input.sourceUrl) {
    try {
      const results = await searchAurora(input.sourceUrl, {
        type: 'document',
        limit: 3,
      });
      const matchIds = results.map((r) => r.id);
      sourceNodeIds = [...new Set([...sourceNodeIds, ...matchIds])];
    } catch {
      // Search failure is non-fatal
    }
  }

  const article = await createArticle({
    title: input.title,
    content: input.content,
    domain: input.domain,
    tags: input.tags,
    concepts: input.concepts,
    sourceNodeIds,
    synthesizedBy: 'manual-import',
    synthesisModel: 'none',
  });

  // Extract concepts via LLM for imported articles (non-fatal)
  try {
    if (!input.concepts || input.concepts.length === 0) {
      const promptPath = path.resolve(import.meta.dirname ?? '.', '../../prompts/concept-extraction.md');
      let extractionPrompt = await fs.readFile(promptPath, 'utf-8');
      extractionPrompt = extractionPrompt.replace('{{text}}', input.content.slice(0, 3000));

      const modelConfig = getSynthesisModelConfig();
      const { client, model } = createAgentClient(modelConfig);
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: extractionPrompt }],
      });
      const responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const jsonBlock = parseJsonBlock(responseText);
      if (jsonBlock && Array.isArray(jsonBlock.concepts)) {
        const conceptData = jsonBlock.concepts.map((c: unknown) => {
          if (typeof c === 'string') return { name: c, facet: 'topic' as const, broaderConcept: null };
          const obj = c as Record<string, unknown>;
          return {
            name: (obj.name as string) ?? String(c),
            facet: (obj.facet as string) ?? 'topic',
            broaderConcept: (obj.broaderConcept as string) ?? null,
            standardRefs: obj.standardRefs as Record<string, string> | undefined,
          };
        });
        await linkArticleToConcepts(article.id, conceptData);
      }
    } else if (input.concepts && input.concepts.length > 0) {
      // If concepts were provided as strings, link them with default facet
      const conceptData = input.concepts.map((name: string) => ({
        name,
        facet: 'topic' as const,
        broaderConcept: null,
      }));
      await linkArticleToConcepts(article.id, conceptData);
    }
  } catch {
    // Concept extraction is non-fatal
  }

  return article;
}

/**
 * Synthesize a new article from Aurora knowledge using an LLM.
 */
export async function synthesizeArticle(
  topic: string,
  options?: { model?: string; domain?: string; tags?: string[] },
): Promise<ArticleNode> {
  // Gather sources in parallel (each wrapped in try/catch)
  const [factsResult, docsResult, gapsResult] = await Promise.all([
    recall(topic).catch(() => ({ memories: [], totalFound: 0 })),
    searchAurora(topic).catch(() => []),
    getGaps().catch(() => ({ gaps: [], totalUnanswered: 0 })),
  ]);

  // Format sources for prompt
  const sourceTexts: string[] = [];
  const sourceNodeIds: string[] = [];

  for (const mem of factsResult.memories) {
    sourceTexts.push(`[${mem.type}] ${mem.title}: ${mem.text}`);
    sourceNodeIds.push(mem.id);
  }

  const docsArray = Array.isArray(docsResult) ? docsResult : [];
  for (const doc of docsArray) {
    sourceTexts.push(`[${doc.type}] ${doc.title}${doc.text ? ': ' + doc.text : ''}`);
    if (!sourceNodeIds.includes(doc.id)) {
      sourceNodeIds.push(doc.id);
    }
  }

  const sourcesText = sourceTexts.length > 0
    ? sourceTexts.join('\n\n')
    : 'Inga källor hittades.';

  const gapsText = gapsResult.gaps.length > 0
    ? gapsResult.gaps.map((g) => `- ${g.question} (ställd ${g.frequency} gånger)`).join('\n')
    : 'Inga kända kunskapsluckor.';

  // Read and fill prompt template
  const promptPath = path.resolve(import.meta.dirname ?? '.', '../../prompts/article-synthesis.md');
  let promptTemplate = await fs.readFile(promptPath, 'utf-8');
  promptTemplate = promptTemplate.replace('{{sources}}', sourcesText);
  promptTemplate = promptTemplate.replace('{{gaps}}', gapsText);

  // Call LLM
  const modelConfig = getSynthesisModelConfig(options?.model);
  const { client, model } = createAgentClient(modelConfig);

  const response = await client.messages.create({
    model,
    max_tokens: modelConfig.maxTokens,
    messages: [{ role: 'user', content: promptTemplate }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Parse response: markdown content + JSON block
  const jsonBlock = parseJsonBlock(responseText);
  const jsonBlockMatch = responseText.match(/```json[\s\S]*$/);
  const markdownContent = jsonBlockMatch
    ? responseText.slice(0, jsonBlockMatch.index).trim()
    : responseText.trim();

  const articleAbstract = (jsonBlock?.abstract as string) ?? markdownContent.slice(0, 200);
  // Extract names for backward-compatible article properties
  const rawConcepts = Array.isArray(jsonBlock?.concepts) ? jsonBlock.concepts : [];
  const concepts = rawConcepts.map((c: unknown) => {
    if (typeof c === 'string') return c;
    const obj = c as Record<string, unknown>;
    return (obj.name as string) ?? String(c);
  });

  // Create article node
  const article = await createArticle({
    title: topic,
    content: markdownContent,
    domain: options?.domain ?? 'general',
    tags: options?.tags ?? [],
    concepts,
    sourceNodeIds,
    synthesizedBy: 'synthesize',
    synthesisModel: model,
    abstract: articleAbstract,
  });

  // Link concepts to ontology
  try {
    const conceptData = Array.isArray(jsonBlock?.concepts) ? jsonBlock.concepts : [];
    // Handle both new format (objects with name/facet) and legacy (string[])
    const conceptsForOntology = conceptData.map((c: unknown) => {
      if (typeof c === 'string') {
        return { name: c, facet: 'topic' as const, broaderConcept: null };
      }
      const obj = c as Record<string, unknown>;
      return {
        name: (obj.name as string) ?? String(c),
        facet: (obj.facet as string) ?? 'topic',
        broaderConcept: (obj.broaderConcept as string) ?? null,
        standardRefs: obj.standardRefs as Record<string, string> | undefined,
      };
    });
    if (conceptsForOntology.length > 0) {
      await linkArticleToConcepts(article.id, conceptsForOntology);
    }
  } catch {
    // Ontology linking is non-fatal
  }

  return article;
}

/**
 * Refresh an existing article by re-synthesizing and comparing content.
 * Only updates if content has changed substantially.
 */
export async function refreshArticle(
  articleId: string,
  options?: { model?: string },
): Promise<ArticleNode> {
  const existing = await getArticle(articleId);
  if (!existing) {
    throw new Error(`Article not found: ${articleId}`);
  }

  const topic = existing.title;
  const newArticle = await synthesizeArticle(topic, {
    model: options?.model,
    domain: existing.properties.domain as string,
    tags: Array.isArray(existing.properties.tags)
      ? (existing.properties.tags as string[])
      : [],
  });

  const oldContent = (existing.properties.content as string) ?? '';
  const newContent = (newArticle.properties.content as string) ?? '';

  if (contentDiffers(oldContent, newContent)) {
    return updateArticle(articleId, {
      title: existing.title,
      content: newContent,
      domain: newArticle.properties.domain as string,
      tags: newArticle.properties.tags as string[],
      concepts: newArticle.properties.concepts as string[],
      sourceNodeIds: newArticle.properties.sourceNodeIds as string[],
      synthesizedBy: 'refresh',
      synthesisModel: newArticle.properties.synthesisModel as string,
      abstract: newArticle.properties.abstract as string,
    });
  }

  return existing;
}
