import crypto from 'crypto';
import { getGaps, type KnowledgeGap } from './knowledge-gaps.js';
import { recall } from './memory.js';
import { searchAurora } from './search.js';
import { createAgentClient } from '../core/agent-client.js';
import {
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from '../core/model-registry.js';
import { getPool } from '../core/db.js';
import { calculateFreshnessScore, freshnessStatus } from './freshness.js';
import type Anthropic from '@anthropic-ai/sdk';

import { createLogger } from '../core/logger.js';
const logger = createLogger('aurora:gap-brief');

// --- Interfaces ---

export interface ResearchSuggestion {
  primaryGap: KnowledgeGap;
  relatedGaps: KnowledgeGap[];
  knownFacts: Array<{
    title: string;
    text?: string;
    confidence: number;
    freshnessStatus: string;
  }>;
  brief: {
    background: string;
    gap: string;
    suggestions: string[];
  };
  metadata: {
    generatedAt: string;
    totalRelatedGaps: number;
    totalKnownFacts: number;
  };
}

export interface SuggestResearchOptions {
  maxRelatedGaps?: number; // Default: 5
  maxFacts?: number; // Default: 10
  minGapSimilarity?: number; // Default: 0.6
}

// --- Helpers ---

/** Get a cheap Haiku model config for brief generation. */
function getModelConfig(): ModelConfig {
  try {
    return resolveModelConfig('researcher');
  } catch (err) {
    logger.error('[gap-brief] loading gap briefs failed', { error: String(err) });
    return {
      ...DEFAULT_MODEL_CONFIG,
      model: 'claude-haiku-4-5-20251001',
    };
  }
}

/**
 * Extract significant words (4+ characters) from a question.
 * Lowercased for case-insensitive matching.
 */
function extractSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

/**
 * Score how many significant words from the primary gap
 * appear in the candidate gap question.
 */
function keywordSimilarity(
  primaryWords: string[],
  candidateQuestion: string,
): number {
  if (primaryWords.length === 0) return 0;
  const candidateLower = candidateQuestion.toLowerCase();
  const matches = primaryWords.filter((w) => candidateLower.includes(w));
  return matches.length / primaryWords.length;
}

/**
 * Find the primary gap: exact match first, then substring match.
 * Returns undefined if no match found.
 */
function matchPrimaryGap(
  question: string,
  gaps: KnowledgeGap[],
): KnowledgeGap | undefined {
  const questionLower = question.toLowerCase();

  // Exact match
  const exact = gaps.find(
    (g) => g.question.toLowerCase() === questionLower,
  );
  if (exact) return exact;

  // Substring match: question in gap or gap in question
  return gaps.find((g) => {
    const gapLower = g.question.toLowerCase();
    return gapLower.includes(questionLower) || questionLower.includes(gapLower);
  });
}

/**
 * Find related gaps using embedding search, with keyword fallback.
 */
async function findRelatedGaps(
  primaryGap: KnowledgeGap,
  allGaps: KnowledgeGap[],
  maxRelatedGaps: number,
  minGapSimilarity: number,
): Promise<KnowledgeGap[]> {
  const otherGaps = allGaps.filter(
    (g) => g.question !== primaryGap.question,
  );
  if (otherGaps.length === 0) return [];

  // Try embedding path first
  try {
    const searchResults = await searchAurora(primaryGap.question, {
      type: 'research',
      limit: maxRelatedGaps * 2,
      minSimilarity: minGapSimilarity,
    });

    // Map search results back to gaps from the gap list
    const related: KnowledgeGap[] = [];
    for (const result of searchResults) {
      const matchingGap = otherGaps.find(
        (g) =>
          g.question === result.title ||
          g.question === result.text ||
          result.title.includes(g.question) ||
          g.question.includes(result.title),
      );
      if (matchingGap && !related.includes(matchingGap)) {
        related.push(matchingGap);
      }
      if (related.length >= maxRelatedGaps) break;
    }

    if (related.length > 0) return related;
  } catch (err) {
    logger.error('[gap-brief] gap brief generation failed', { error: String(err) });
  }

  // Keyword fallback
  const primaryWords = extractSignificantWords(primaryGap.question);
  const scored = otherGaps
    .map((g) => ({
      gap: g,
      score: keywordSimilarity(primaryWords, g.question),
    }))
    .filter((s) => s.score >= minGapSimilarity)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRelatedGaps);

  return scored.map((s) => s.gap);
}

/**
 * Enrich recall memories with freshness info from DB.
 * Same pattern as briefing.ts.
 */
async function gatherKnownFacts(
  question: string,
  maxFacts: number,
): Promise<ResearchSuggestion['knownFacts']> {
  const recallResult = await recall(question, { limit: maxFacts });

  const facts = recallResult.memories.map((m) => ({
    nodeId: m.id,
    title: m.title,
    text: m.text || undefined,
    confidence: m.confidence,
    freshnessStatus: 'unverified' as string,
  }));

  // Enrich with freshness info
  try {
    const pool = getPool();
    for (const fact of facts) {
      try {
        const { rows } = await pool.query(
          'SELECT last_verified FROM aurora_nodes WHERE id = $1',
          [fact.nodeId],
        );
        const lastVerified = rows[0]?.last_verified
          ? new Date(rows[0].last_verified as string)
          : null;
        const score = calculateFreshnessScore(lastVerified);
        fact.freshnessStatus = freshnessStatus(score, lastVerified);
      } catch {  /* intentional: JSON parse may fail */
        // Keep default 'unverified'
      }
    }
  } catch (err) {
    logger.error('[gap-brief] reading gap brief failed', { error: String(err) });
  }

  return facts.map(({ nodeId: _nodeId, ...rest }) => rest);
}

/**
 * Generate a research brief using Claude Haiku.
 * Returns a structured brief with background, gap, and suggestions.
 */
async function generateBrief(
  primaryGap: KnowledgeGap,
  relatedGaps: KnowledgeGap[],
  knownFacts: ResearchSuggestion['knownFacts'],
): Promise<ResearchSuggestion['brief']> {
  const config = getModelConfig();
  const { client, model } = createAgentClient(config);

  const prompt = `Given this knowledge gap and context, generate a research brief.

Primary gap: "${primaryGap.question}"
Related gaps: ${relatedGaps.map((g) => `"${g.question}"`).join(', ') || 'None'}
Known facts: ${JSON.stringify(knownFacts, null, 2)}

Respond with JSON:
{
  "background": "2-3 sentences summarizing known facts",
  "gap": "formulate what is missing based on the gaps",
  "suggestions": ["3-5 concrete research actions"]
}`;

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: 'You are a research assistant. Respond only with valid JSON. No markdown.',
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Try parsing JSON
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        background?: string;
        gap?: string;
        suggestions?: string[];
      };
      return {
        background: parsed.background ?? 'No background available.',
        gap: parsed.gap ?? primaryGap.question,
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions
          : ['Research this topic further'],
      };
    }
  } catch {  /* intentional: parse may fail */
    // JSON parsing failed — fall through to fallback
  }

  // Fallback: create simple structure from text
  return {
    background: responseText.slice(0, 200) || 'No background available.',
    gap: primaryGap.question,
    suggestions: ['Research this topic further'],
  };
}

// --- Core Functions ---

/**
 * Generate a research suggestion for a given question.
 * Pipeline: fetch gaps → match primary → find related → gather facts → generate brief.
 */
export async function suggestResearch(
  question: string,
  options?: SuggestResearchOptions,
): Promise<ResearchSuggestion> {
  const maxRelatedGaps = options?.maxRelatedGaps ?? 5;
  const maxFacts = options?.maxFacts ?? 10;
  const minGapSimilarity = options?.minGapSimilarity ?? 0.6;

  // Step 1: Fetch gaps
  const { gaps } = await getGaps(50);

  // Step 2: Match primary gap
  const matchedGap = matchPrimaryGap(question, gaps);
  const primaryGap: KnowledgeGap = matchedGap ?? {
    id: crypto.randomUUID(),
    question,
    askedAt: new Date().toISOString(),
    frequency: 0,
  };

  // Step 3: Find related gaps
  const relatedGaps = await findRelatedGaps(
    primaryGap,
    gaps,
    maxRelatedGaps,
    minGapSimilarity,
  );

  // Step 4: Gather known facts
  const knownFacts = await gatherKnownFacts(question, maxFacts);

  // Step 5: Generate brief
  const brief = await generateBrief(primaryGap, relatedGaps, knownFacts);

  // Step 6: Return complete ResearchSuggestion
  return {
    primaryGap,
    relatedGaps,
    knownFacts,
    brief,
    metadata: {
      generatedAt: new Date().toISOString(),
      totalRelatedGaps: relatedGaps.length,
      totalKnownFacts: knownFacts.length,
    },
  };
}

/**
 * Generate research suggestions for the top N most frequent gaps.
 * Deduplicates by tracking covered gap questions.
 */
export async function suggestResearchBatch(
  options?: SuggestResearchOptions & { topN?: number },
): Promise<ResearchSuggestion[]> {
  const topN = options?.topN ?? 3;

  // Step 1: Fetch more gaps than needed for margin
  const { gaps } = await getGaps(topN * 3);

  // Step 2: Already sorted by frequency from getGaps
  const covered = new Set<string>();
  const suggestions: ResearchSuggestion[] = [];

  // Step 3-4: Process each top gap that is not covered
  for (const gap of gaps) {
    if (covered.has(gap.question)) continue;
    if (suggestions.length >= topN) break;

    const suggestion = await suggestResearch(gap.question, options);

    // Mark primary and related gaps as covered
    covered.add(suggestion.primaryGap.question);
    for (const related of suggestion.relatedGaps) {
      covered.add(related.question);
    }

    suggestions.push(suggestion);
  }

  return suggestions;
}
