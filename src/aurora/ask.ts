import path from 'path';
import fs from 'fs/promises';
import type Anthropic from '@anthropic-ai/sdk';
import { searchAurora, type SearchResult } from './search.js';
import { createAgentClient } from '../core/agent-client.js';
import { AURORA_MODELS, AURORA_TOKENS, AURORA_SIMILARITY } from './llm-defaults.js';
import {
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from '../core/model-registry.js';
import { remember } from './memory.js';
import type { RememberResult } from './memory.js';
import { recordGap } from './knowledge-gaps.js';
import { importArticle } from './knowledge-library.js';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:ask');

const _promptCache = new Map<string, string>();
async function loadPrompt(name: string): Promise<string> {
  let text = _promptCache.get(name);
  if (!text) {
    const p = path.resolve(import.meta.dirname ?? '.', `../../prompts/${name}.md`);
    text = await fs.readFile(p, 'utf-8');
    _promptCache.set(name, text);
  }
  return text;
}

export interface AskOptions {
  maxSources?: number; // Default: 10
  minSimilarity?: number; // Default: 0.3
  type?: string;
  scope?: string;
  maxTokens?: number; // Default: 1024
  /** Extrahera och spara fakta från svaret. Default: false. */
  learn?: boolean;
  /** Spara svaret som en artikel i kunskapsbiblioteket. Default: false. */
  saveAsArticle?: boolean;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  sourcesUsed: number;
  noSourcesFound: boolean;
  /** Fakta som lärdes (om learn=true). */
  factsLearned?: RememberResult[];
  /** Artikeln som skapades (om saveAsArticle=true). */
  savedArticle?: { id: string; title: string };
}

export interface Citation {
  nodeId: string;
  title: string;
  type: string;
  similarity: number;
}



/**
 * Format search results into a numbered context string for the LLM prompt.
 *
 * Each source is formatted as:
 *   [Source N: "Title" (type, similarity: 0.87)]
 *   <text content or "(no text content)">
 */
export function formatContext(results: SearchResult[]): string {
  return results
    .map((result, index) => {
      const num = index + 1;
      const simLabel =
        result.similarity === null
          ? 'keyword match'
          : `similarity: ${result.similarity.toFixed(2)}`;
      const header = `[Source ${num}: "${result.title}" (${result.type}, ${simLabel})]`;
      const body = result.text ?? '(no text content)';
      return `${header}\n${body}`;
    })
    .join('\n\n');
}

/**
 * Resolve the model config for the Aurora ask pipeline.
 * Tries resolveModelConfig('researcher') first, then falls back
 * to a cost-efficient Haiku-based config.
 */
function getAskModelConfig(): ModelConfig {
  try {
    return resolveModelConfig('researcher');
  } catch (err) {
    logger.error('[ask] ask query failed', { error: String(err) });
    return {
      ...DEFAULT_MODEL_CONFIG,
      model: AURORA_MODELS.fast,
    };
  }
}

/**
 * Get a cheap Haiku config for auto-learning extraction.
 */
function getLearnModelConfig(): ModelConfig {
  return {
    ...DEFAULT_MODEL_CONFIG,
    model: AURORA_MODELS.fast,
    maxTokens: 1024,
  };
}

/**
 * Extract key facts from an answer using a cheap Haiku call,
 * then save them via remember().
 */
async function learnFromAnswer(answer: string): Promise<RememberResult[]> {
  const config = getLearnModelConfig();
  const { client, model } = createAgentClient(config);

  const learnPrompt = (await loadPrompt('ask-learn-facts')).replace('{{answer}}', answer);

  const response = await client.messages.create({
    model,
    max_tokens: AURORA_TOKENS.medium,
    messages: [
      {
        role: 'user',
        content: learnPrompt,
      },
    ],
  });

  // Parse JSON array from response
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Try to extract JSON array from the response text
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const facts: unknown = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(facts)) return [];

  // Save each fact via remember()
  const results: RememberResult[] = [];
  for (const fact of facts.slice(0, 5)) {
    if (typeof fact === 'string' && fact.trim().length > 0) {
      const result = await remember(fact.trim(), {
        type: 'fact',
        source: 'auto-extracted',
      });
      results.push(result);
    }
  }

  return results;
}

/**
 * Ask a question against the Aurora knowledge graph.
 *
 * Searches for relevant sources, then uses Claude to synthesize
 * an answer grounded in those sources.
 */
export async function ask(
  question: string,
  options?: AskOptions,
): Promise<AskResult> {
  // Step 1: Search for relevant sources
  const results = await searchAurora(question, {
    limit: options?.maxSources ?? 10,
    minSimilarity: options?.minSimilarity ?? AURORA_SIMILARITY.searchLoose,
    type: options?.type,
    scope: options?.scope,
    includeRelated: false,
  });

  // Step 2: No results — return early without calling Claude
  if (results.length === 0) {
    // Record knowledge gap
    try {
      await recordGap(question);
    } catch (err) {
      logger.error('[ask] ask context loading failed', { error: String(err) });
    }
    return {
      answer:
        'Inga relevanta källor hittades i kunskapsbasen för din fråga.',
      citations: [],
      sourcesUsed: 0,
      noSourcesFound: true,
    };
  }

  // Step 3: Format context
  const context = formatContext(results);

  // Step 4: Build citations
  const citations: Citation[] = results.map((r) => ({
    nodeId: r.id,
    title: r.title,
    type: r.type,
    similarity: r.similarity ?? 0,
  }));

  // Step 5: Create Claude client
  const config = getAskModelConfig();

  // Step 6: Call Claude
  const userMessage = `## Källor\n\n${context}\n\n## Fråga\n\n${question}`;

  try {
    const { client, model } = createAgentClient(config);
    const response = await client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 1024,
      system: await loadPrompt('ask-system'),
      messages: [{ role: 'user', content: userMessage }],
    });

    // Step 7: Extract answer text
    const answer = response.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      )
      .map((block) => block.text)
      .join('\n');

    // Step 8: Auto-learn if requested
    let factsLearned: RememberResult[] | undefined;
    if (options?.learn) {
      try {
        factsLearned = await learnFromAnswer(answer);
      } catch {  /* intentional: context file may not exist */
        // Auto-learning is non-fatal — log but don't block
      }
    }

    // Step 9: Save as article if requested (no extra LLM call)
    let savedArticle: { id: string; title: string } | undefined;
    if (options?.saveAsArticle && answer.length > 100) {
      try {
        const article = await importArticle({
          title: question,
          content: answer,
          domain: 'general',
          sourceNodeIds: results.map((r) => r.id),
        });
        savedArticle = { id: article.id, title: article.title };
      } catch {
        // Article saving is non-fatal
      }
    }

    // Step 10: Return result
    return {
      answer,
      citations,
      sourcesUsed: results.length,
      noSourcesFound: false,
      ...(factsLearned ? { factsLearned } : {}),
      ...(savedArticle ? { savedArticle } : {}),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      answer: `Fel vid generering av svar: ${message}`,
      citations,
      sourcesUsed: results.length,
      noSourcesFound: false,
    };
  }
}
