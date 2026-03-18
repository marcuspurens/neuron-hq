import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  loadAuroraGraph,
  saveAuroraGraph,
  addAuroraNode,
  updateAuroraNode,
  findAuroraNodes,
} from './aurora-graph.js';
import { searchAurora } from './search.js';
import type { AuroraNode } from './aurora-schema.js';
import { createAgentClient } from '../core/agent-client.js';
import {
  resolveModelConfig,
  DEFAULT_MODEL_CONFIG,
  type ModelConfig,
} from '../core/model-registry.js';
import type Anthropic from '@anthropic-ai/sdk';

export interface KnowledgeGap {
  id: string;
  question: string;
  askedAt: string;
  frequency: number;
}

export interface GapsResult {
  gaps: KnowledgeGap[];
  totalUnanswered: number;
}

export interface GapOptions {
  limit?: number;
  includeResolved?: boolean;
}

export interface EmergentGap {
  question: string;
  source: 'emergent';
  chainedFrom: string;  // original gap ID that led to this
  confidence: number;    // 0-1, how relevant the follow-up is
}

/** Generate a short title from text, truncating at word boundary if needed. */
function generateTitle(text: string): string {
  const maxLen = 60;
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > 20 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
}

/** Check if a node is a gap node (research type with gapType 'unanswered'). */
function isGapNode(node: AuroraNode): boolean {
  return node.type === 'research' && node.properties.gapType === 'unanswered';
}

/**
 * Spara en fråga som saknade källor.
 * Deduplicerar mot befintliga luckor (semantiskt).
 */
export async function recordGap(question: string): Promise<void> {
  let graph = await loadAuroraGraph();

  // Try semantic search for existing gap nodes
  let existingGapNode: AuroraNode | undefined;
  try {
    const results = await searchAurora(question, {
      type: 'research',
      limit: 3,
      minSimilarity: 0.7,
    });

    // Find the first result that is actually a gap node
    for (const result of results) {
      const node = graph.nodes.find((n) => n.id === result.id);
      if (node && isGapNode(node)) {
        existingGapNode = node;
        break;
      }
    }
  } catch {  /* intentional: knowledge-gaps file may not exist */
    // Fallback to keyword search
    const found = findAuroraNodes(graph, { type: 'research', query: question });
    existingGapNode = found.find(isGapNode);
  }

  if (existingGapNode) {
    // Increment frequency
    const currentFreq = typeof existingGapNode.properties.frequency === 'number'
      ? existingGapNode.properties.frequency
      : 1;
    graph = updateAuroraNode(graph, existingGapNode.id, {
      properties: {
        ...existingGapNode.properties,
        frequency: currentFreq + 1,
      },
    });
    await saveAuroraGraph(graph);
    return;
  }

  // Create new gap node
  const now = new Date().toISOString();
  const newNode: AuroraNode = {
    id: crypto.randomUUID(),
    type: 'research',
    title: generateTitle(question),
    properties: {
      text: question,
      gapType: 'unanswered',
      frequency: 1,
    },
    confidence: 0.5,
    scope: 'personal',
    created: now,
    updated: now,
  };

  graph = addAuroraNode(graph, newNode);
  await saveAuroraGraph(graph);
}

/**
 * Hämta kända kunskapsluckor.
 */
export async function getGaps(options?: number | GapOptions): Promise<GapsResult> {
  const graph = await loadAuroraGraph();

  // Support both old (number) and new (GapOptions) signatures for backwards compatibility
  const opts: GapOptions = typeof options === 'number'
    ? { limit: options }
    : options ?? {};

  const maxResults = opts.limit ?? 20;
  const includeResolved = opts.includeResolved ?? false;

  const gapNodes = graph.nodes.filter((node) => {
    if (node.type !== 'research') return false;
    if (includeResolved) {
      return node.properties.gapType === 'unanswered' || node.properties.gapType === 'resolved';
    }
    return node.properties.gapType === 'unanswered';
  });

  const gaps: KnowledgeGap[] = gapNodes.map((node) => ({
    id: node.id,
    question: typeof node.properties.text === 'string' ? node.properties.text : node.title,
    askedAt: node.created,
    frequency: typeof node.properties.frequency === 'number' ? node.properties.frequency : 1,
  }));

  gaps.sort((a, b) => b.frequency - a.frequency);

  return {
    gaps: gaps.slice(0, maxResults),
    totalUnanswered: gapNodes.length,
  };
}

/**
 * Mark a knowledge gap as resolved.
 */
export async function resolveGap(gapId: string, evidence: {
  researchedBy: string;
  urlsIngested: string[];
  factsLearned: number;
}): Promise<void> {
  let graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === gapId);
  if (!node) return;

  graph = updateAuroraNode(graph, gapId, {
    properties: {
      ...node.properties,
      gapType: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolvedBy: evidence.researchedBy,
      evidence: {
        urlsIngested: evidence.urlsIngested,
        factsLearned: evidence.factsLearned,
      },
    },
  });
  await saveAuroraGraph(graph);
}

// ---------------------------------------------------------------------------
//  extractEmergentGaps
// ---------------------------------------------------------------------------

/** Get a cheap Haiku model config for emergent gap extraction. */
function getEmergentModelConfig(): ModelConfig {
  try {
    return resolveModelConfig('researcher');
  } catch (err) {
    console.error('[knowledge-gaps] knowledge gap analysis failed:', err);
    return {
      ...DEFAULT_MODEL_CONFIG,
      model: 'claude-haiku-4-5-20251001',
    };
  }
}

/**
 * Extract new knowledge gaps that emerge from recently ingested text.
 * Uses LLM to identify follow-up questions, then deduplicates against existing gaps.
 */
export async function extractEmergentGaps(input: {
  ingestedNodeIds: string[];
  existingGapIds: string[];
  chainedFromGapId: string;
  maxGaps?: number;
}): Promise<EmergentGap[]> {
  try {
    const maxGaps = input.maxGaps ?? 5;

    // Step 1: Load graph and find ingested nodes
    const graph = await loadAuroraGraph();
    const ingestedNodes = graph.nodes.filter((n) =>
      input.ingestedNodeIds.includes(n.id),
    );

    if (ingestedNodes.length === 0) {
      return [];
    }

    // Extract text from ingested nodes
    const texts = ingestedNodes.map((node) => {
      const text = typeof node.properties.text === 'string'
        ? node.properties.text
        : node.title;
      return text;
    });
    const concatenatedText = texts.join('\n\n');

    // Step 2: Read prompt template and replace placeholder
    const promptPath = path.resolve(
      import.meta.dirname ?? '.',
      '../../prompts/emergent-gaps.md',
    );
    let promptTemplate = await fs.readFile(promptPath, 'utf-8');
    promptTemplate = promptTemplate.replace('{{text}}', concatenatedText);

    // Step 3: Call LLM
    const config = getEmergentModelConfig();
    const { client, model } = createAgentClient(config);

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: promptTemplate }],
    });

    // Step 4: Parse response — extract JSON with questions
    const responseText = response.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      )
      .map((block) => block.text)
      .join('');

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) {
      return [];
    }

    const rawQuestions = parsed.questions.filter(
      (q): q is string => typeof q === 'string' && q.trim().length > 0,
    );

    // Step 5: Semantic dedup against existing gaps
    const dedupedQuestions: string[] = [];
    for (const question of rawQuestions) {
      let isDuplicate = false;
      try {
        const similar = await searchAurora(question, {
          type: 'research',
          limit: 3,
          minSimilarity: 0.85,
        });
        if (similar.length > 0) {
          isDuplicate = true;
        }
      } catch {  /* intentional: JSON parse may fail */
        // If search fails, keep the question (no dedup)
      }

      if (!isDuplicate) {
        dedupedQuestions.push(question);
      }
    }

    // Step 6 & 7: Map to EmergentGap[] and apply limit
    return dedupedQuestions.slice(0, maxGaps).map((question) => ({
      question,
      source: 'emergent' as const,
      chainedFrom: input.chainedFromGapId,
      confidence: 0.7,
    }));
  } catch (err) {
    console.error('[knowledge-gaps] knowledge gap save failed:', err);
    return [];
  }
}
