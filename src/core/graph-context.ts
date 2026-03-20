/**
 * Graph context module.
 * Fetches relevant knowledge graph nodes based on brief context
 * using a 3-step pipeline: keyword matching, PPR expansion, and recent errors.
 *
 * PURE module — no side effects, no I/O.
 */

import { pprQuery } from './knowledge-graph.js';
import type { KnowledgeGraph, KGNode } from './knowledge-graph.js';
import type { BriefContext } from './brief-context-extractor.js';

// ── Types ────────────────────────────────────────────────

export interface GraphContextNode {
  node: KGNode;
  relevance: 'high' | 'medium';
  source: 'keyword' | 'ppr' | 'recent';
}

export interface GraphContextResult {
  nodes: GraphContextNode[];
  summary: string;
}

export interface GraphContextOptions {
  /** Maximum nodes to return (default 15). */
  maxNodes?: number;
  /** Whether to include recent error nodes (default true). */
  includeErrors?: boolean;
  /** Extra seed node IDs for PPR expansion. */
  pprSeeds?: string[];
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Check if any keyword appears as a case-insensitive substring in the given text.
 */
function textMatchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Generate a Swedish summary of the result nodes.
 */
function buildSummary(nodes: GraphContextNode[]): string {
  if (nodes.length === 0) return 'Inga relevanta noder hittades.';

  const patterns = nodes.filter((n) => n.node.type === 'pattern').length;
  const errors = nodes.filter((n) => n.node.type === 'error').length;
  const ideas = nodes.filter((n) => n.node.type === 'idea').length;
  const pprCount = nodes.filter((n) => n.source === 'ppr').length;

  return `Hittade ${patterns} patterns, ${errors} errors, ${ideas} idéer (${pprCount} via PPR).`;
}

// ── Main Function ────────────────────────────────────────

/**
 * Fetch relevant knowledge graph nodes for a brief context using a 3-step pipeline.
 *
 * Step 1: Keyword matching on node title and description.
 * Step 2: PPR expansion from keyword-matched seeds.
 * Step 3: Recent error nodes.
 *
 * @param graph - The knowledge graph to search
 * @param briefContext - Extracted brief context with keywords and node types
 * @param options - Optional configuration
 * @returns Deduplicated, sorted, and capped graph context result
 */
export function getGraphContextForBrief(
  graph: KnowledgeGraph,
  briefContext: BriefContext,
  options?: GraphContextOptions,
): GraphContextResult {
  const maxNodes = options?.maxNodes ?? 15;
  const includeErrors = options?.includeErrors ?? true;
  const pprSeeds = options?.pprSeeds ?? [];

  const resultMap = new Map<string, GraphContextNode>();

  // ── Step 1: Keyword matching ─────────────────────────
  for (const node of graph.nodes) {
    if (!briefContext.nodeTypes.includes(node.type)) continue;

    const description = node.properties.description;
    const descriptionStr = typeof description === 'string' ? description : '';

    const titleMatch = textMatchesKeywords(node.title, briefContext.keywords);
    const descMatch = descriptionStr
      ? textMatchesKeywords(descriptionStr, briefContext.keywords)
      : false;

    if (titleMatch || descMatch) {
      resultMap.set(node.id, { node, relevance: 'high', source: 'keyword' });
    }
  }

  // ── Step 2: PPR expansion ────────────────────────────
  const keywordIds = [...resultMap.keys()];
  const allSeeds = [...keywordIds, ...pprSeeds];

  if (allSeeds.length > 0) {
    const pprResults = pprQuery(graph, allSeeds, { limit: 10, minScore: 0.01 });

    let pprAdded = 0;
    for (const { node } of pprResults) {
      if (pprAdded >= 5) break;
      if (resultMap.has(node.id)) continue;
      resultMap.set(node.id, { node, relevance: 'medium', source: 'ppr' });
      pprAdded++;
    }
  }

  // ── Step 3: Recent errors ────────────────────────────
  if (includeErrors) {
    const errorNodes = graph.nodes
      .filter((n) => n.type === 'error')
      .sort((a, b) => (b.created > a.created ? 1 : b.created < a.created ? -1 : 0))
      .slice(0, 5);

    for (const node of errorNodes) {
      if (resultMap.has(node.id)) continue;
      resultMap.set(node.id, { node, relevance: 'medium', source: 'recent' });
    }
  }

  // ── Final assembly ───────────────────────────────────
  const allNodes = [...resultMap.values()];

  // Sort: high first, then medium
  allNodes.sort((a, b) => {
    if (a.relevance === 'high' && b.relevance === 'medium') return -1;
    if (a.relevance === 'medium' && b.relevance === 'high') return 1;
    return 0;
  });

  const capped = allNodes.slice(0, maxNodes);
  const summary = buildSummary(capped);

  return { nodes: capped, summary };
}

// ── Formatter for Manager Prompt ─────────────────────────

/**
 * Format graph context results into a markdown section for the Manager system prompt.
 *
 * Groups nodes by type (patterns/errors, techniques, ideas) and optionally
 * appends fallback top-ranked ideas from rankIdeas().
 *
 * @param result - The graph context result from getGraphContextForBrief
 * @param fallbackIdeas - Optional top-ranked ideas to append as fallback
 * @returns Formatted markdown string for inclusion in system prompt
 */
export function formatGraphContextForManager(
  result: GraphContextResult,
  fallbackIdeas?: KGNode[],
): string {
  const lines: string[] = [];
  lines.push('\n\n## Relevant kunskap från grafen\n');
  lines.push(`Baserat på briefens innehåll hittade vi följande relevanta noder:\n`);

  // Group nodes by type
  const patterns = result.nodes.filter(n => n.node.type === 'pattern' || n.node.type === 'error');
  const ideas = result.nodes.filter(n => n.node.type === 'idea');
  const techniques = result.nodes.filter(n => n.node.type === 'technique');

  if (patterns.length > 0) {
    lines.push('### Patterns & Errors (agera på dessa)\n');
    for (const entry of patterns) {
      const n = entry.node;
      const prefix = n.type === 'error' ? '[E]' : '[P]';
      const desc = (n.properties.description as string) || '';
      const descShort = desc.length > 80 ? desc.substring(0, 77) + '...' : desc;
      lines.push(`- ${prefix} **${n.title}** (confidence: ${n.confidence}) — ${descShort}`);
    }
    lines.push('');
  }

  if (techniques.length > 0) {
    lines.push('### Tekniker\n');
    for (const entry of techniques) {
      const n = entry.node;
      const desc = (n.properties.description as string) || '';
      const descShort = desc.length > 80 ? desc.substring(0, 77) + '...' : desc;
      lines.push(`- [T] **${n.title}** (confidence: ${n.confidence}) — ${descShort}`);
    }
    lines.push('');
  }

  if (ideas.length > 0) {
    lines.push('### Relaterade idéer (kontext)\n');
    for (const entry of ideas) {
      const n = entry.node;
      const impact = (n.properties.impact as number) || 0;
      const effort = (n.properties.effort as number) || 0;
      lines.push(`- [I] **${n.title}** (impact: ${impact}, effort: ${effort})`);
    }
    lines.push('');
  }

  // Add fallback ideas if provided
  if (fallbackIdeas && fallbackIdeas.length > 0) {
    lines.push('### Top-rankade idéer\n');
    for (const idea of fallbackIdeas) {
      const impact = (idea.properties.impact as number) || 0;
      const effort = (idea.properties.effort as number) || 0;
      const priority = (idea.properties.priority as number) || 0;
      const group = (idea.properties.group as string) || '';
      lines.push(`- **${idea.title}** (impact:${impact} effort:${effort} priority:${priority.toFixed(1)}${group ? ` group:${group}` : ''})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
