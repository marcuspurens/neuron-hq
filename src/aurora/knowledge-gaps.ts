import crypto from 'crypto';
import {
  loadAuroraGraph,
  saveAuroraGraph,
  addAuroraNode,
  updateAuroraNode,
  findAuroraNodes,
} from './aurora-graph.js';
import { searchAurora } from './search.js';
import type { AuroraNode } from './aurora-schema.js';

export interface KnowledgeGap {
  question: string;
  askedAt: string;
  frequency: number;
}

export interface GapsResult {
  gaps: KnowledgeGap[];
  totalUnanswered: number;
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
  } catch {
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
export async function getGaps(limit?: number): Promise<GapsResult> {
  const graph = await loadAuroraGraph();
  const maxResults = limit ?? 20;

  const gapNodes = graph.nodes.filter(isGapNode);

  const gaps: KnowledgeGap[] = gapNodes.map((node) => ({
    question: typeof node.properties.text === 'string' ? node.properties.text : node.title,
    askedAt: node.created,
    frequency: typeof node.properties.frequency === 'number' ? node.properties.frequency : 1,
  }));

  // Sort by frequency descending
  gaps.sort((a, b) => b.frequency - a.frequency);

  return {
    gaps: gaps.slice(0, maxResults),
    totalUnanswered: gapNodes.length,
  };
}
