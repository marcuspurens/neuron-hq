import type Anthropic from '@anthropic-ai/sdk';
import { searchAurora, type SearchResult } from './search.js';
import { createAgentClient } from '../core/agent-client.js';
import {
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from '../core/model-registry.js';

export interface AskOptions {
  maxSources?: number; // Default: 10
  minSimilarity?: number; // Default: 0.3
  type?: string;
  scope?: string;
  maxTokens?: number; // Default: 1024
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  sourcesUsed: number;
  noSourcesFound: boolean;
}

export interface Citation {
  nodeId: string;
  title: string;
  type: string;
  similarity: number;
}

const SYSTEM_PROMPT = `Du är Aurora, en personlig kunskapsassistent. Du svarar på frågor baserat på dokumenten i din kunskapsbas. Svara alltid på samma språk som frågan.

Regler:
- Basera ditt svar ENBART på de källor som ges nedan
- Om källorna inte innehåller tillräcklig information, säg det tydligt
- Referera till källor med [Source N] i ditt svar
- Var koncis men grundlig
- Om frågan är på svenska, svara på svenska`;

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
  } catch {
    return {
      ...DEFAULT_MODEL_CONFIG,
      model: 'claude-haiku-4-5-20251001',
    };
  }
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
    minSimilarity: options?.minSimilarity ?? 0.3,
    type: options?.type,
    scope: options?.scope,
    includeRelated: false,
  });

  // Step 2: No results — return early without calling Claude
  if (results.length === 0) {
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
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Step 7: Extract answer text
    const answer = response.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      )
      .map((block) => block.text)
      .join('\n');

    // Step 8: Return result
    return {
      answer,
      citations,
      sourcesUsed: results.length,
      noSourcesFound: false,
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
