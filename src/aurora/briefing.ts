import { recall } from './memory.js';
import { searchAurora } from './search.js';
import { getGaps } from './knowledge-gaps.js';
import { unifiedSearch } from './cross-ref.js';
import { createAgentClient } from '../core/agent-client.js';
import {
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from '../core/model-registry.js';
import { getPool } from '../core/db.js';
import { calculateFreshnessScore, freshnessStatus } from './freshness.js';
import type Anthropic from '@anthropic-ai/sdk';

// --- Interfaces ---

export interface BriefingOptions {
  maxFacts?: number; // Default: 10
  maxTimeline?: number; // Default: 10
  maxGaps?: number; // Default: 5
  maxCrossRefs?: number; // Default: 5
  minSimilarity?: number; // Default: 0.3
}

/** Possible freshness statuses for a fact. */
type FreshnessStatusType = 'fresh' | 'aging' | 'stale' | 'unverified';

export interface BriefingResult {
  topic: string;
  summary: string;
  facts: Array<{
    title: string;
    type: string;
    confidence: number;
    similarity: number;
    text?: string;
    freshnessScore: number;
    freshnessStatus: FreshnessStatusType;
  }>;
  timeline: Array<{
    title: string;
    type: string;
    createdAt: string;
    confidence: number;
  }>;
  gaps: Array<{
    question: string;
    frequency: number;
    askedAt: string;
  }>;
  crossRefs: {
    neuron: Array<{ title: string; type: string; similarity: number }>;
    aurora: Array<{ title: string; type: string; similarity: number }>;
  };
  metadata: {
    generatedAt: string;
    totalSources: number;
    totalGaps: number;
    totalCrossRefs: number;
  };
}

// --- Helpers ---

/** Get a cheap Haiku model config for summary generation. */
function getModelConfig(): ModelConfig {
  try {
    return resolveModelConfig('researcher');
  } catch {
    return {
      ...DEFAULT_MODEL_CONFIG,
      model: 'claude-haiku-4-5-20251001',
    };
  }
}

// --- Core Function ---

/**
 * Produce a knowledge briefing report for a given topic.
 * Orchestrates recall, search, gaps, and cross-ref lookups in parallel,
 * then uses Claude Haiku to generate a concise summary.
 */
export async function briefing(
  topic: string,
  options?: BriefingOptions,
): Promise<BriefingResult> {
  const maxFacts = options?.maxFacts ?? 10;
  const maxTimeline = options?.maxTimeline ?? 10;
  const maxGaps = options?.maxGaps ?? 5;
  const maxCrossRefs = options?.maxCrossRefs ?? 5;
  const minSimilarity = options?.minSimilarity ?? 0.3;

  // Step 1: Run 4 searches in parallel
  const [recallResult, searchResult, gapsResult, crossRefResult] =
    await Promise.all([
      recall(topic, { limit: maxFacts, minSimilarity }),
      searchAurora(topic, { limit: maxTimeline, minSimilarity }),
      getGaps(maxGaps),
      unifiedSearch(topic, { limit: maxCrossRefs, minSimilarity }),
    ]);

  // Step 2: Map facts from recall (with nodeId for freshness lookup)
  const facts = recallResult.memories.map((m) => ({
    nodeId: m.id, // for freshness lookup
    title: m.title,
    type: m.type,
    confidence: m.confidence,
    similarity: m.similarity ?? 0,
    ...(m.text ? { text: m.text } : {}),
    freshnessScore: 0, // default, enriched below
    freshnessStatus: 'unverified' as FreshnessStatusType,
  }));

  // Step 2b: Enrich facts with freshness info
  try {
    const pool = getPool();
    for (const fact of facts) {
      try {
        const { rows } = await pool.query(
          'SELECT last_verified FROM aurora_nodes WHERE id = $1',
          [fact.nodeId],
        );
        const lastVerified = rows[0]?.last_verified
          ? new Date(rows[0].last_verified)
          : null;
        fact.freshnessScore = calculateFreshnessScore(lastVerified);
        fact.freshnessStatus = freshnessStatus(
          fact.freshnessScore,
          lastVerified,
        );
      } catch {
        // Keep defaults (0, 'unverified') on failure
      }
    }
  } catch {
    // DB not available — all facts stay as 'unverified'
  }

  // Step 3: Map timeline from searchAurora
  // SearchResult doesn't have createdAt — use empty string
  const timelineEntries = searchResult.map((r) => ({
    title: r.title,
    type: r.type,
    createdAt: '',
    confidence: r.confidence,
  }));

  // Step 4: Filter gaps on topic relevance
  const topicLower = topic.toLowerCase();
  let filteredGaps = gapsResult.gaps.filter((g) =>
    g.question.toLowerCase().includes(topicLower),
  );
  if (filteredGaps.length === 0) {
    // Include most frequent gaps (max 3)
    filteredGaps = gapsResult.gaps.slice(0, 3);
  }

  // Step 5: Map cross-refs
  const neuronRefs = crossRefResult.neuronResults.map((r) => ({
    title: r.node.title,
    type: r.node.type,
    similarity: r.similarity,
  }));
  const auroraRefs = crossRefResult.auroraResults.map((r) => ({
    title: r.node.title,
    type: r.node.type,
    similarity: r.similarity,
  }));

  // Step 6: Generate summary with Claude Haiku
  const config = getModelConfig();
  const { client, model } = createAgentClient(config);

  const summaryData = {
    facts,
    timeline: timelineEntries,
    gaps: filteredGaps,
    crossRefs: { neuron: neuronRefs, aurora: auroraRefs },
  };

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system:
      'Du sammanfattar en kunskapsrapport. Svara på svenska. Var koncis. Nämn antal källor, kunskapsluckor, och kopplingar.',
    messages: [
      {
        role: 'user',
        content: `Sammanfatta denna kunskapsrapport om "${topic}":\n\n${JSON.stringify(summaryData, null, 2)}`,
      },
    ],
  });

  const summary = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const finalSummary = summary || `Inga fakta hittades om "${topic}".`;

  // Step 7: Build metadata
  const totalSources = facts.length + timelineEntries.length;
  const totalGaps = filteredGaps.length;
  const totalCrossRefs = neuronRefs.length + auroraRefs.length;

  // Step 8: Return result
  return {
    topic,
    summary: finalSummary,
    facts: facts.map(({ nodeId, ...rest }) => rest),
    timeline: timelineEntries,
    gaps: filteredGaps,
    crossRefs: { neuron: neuronRefs, aurora: auroraRefs },
    metadata: {
      generatedAt: new Date().toISOString(),
      totalSources,
      totalGaps,
      totalCrossRefs,
    },
  };
}
