import { loadAuroraGraph } from './aurora-graph.js';

export interface TimelineEntry {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  scope: string;
  confidence: number;
  source?: string;
}

export interface TimelineOptions {
  limit?: number;
  type?: string;
  scope?: string;
  since?: string;
  until?: string;
}

/**
 * Hämta en kronologisk tidslinje av Aurora-noder.
 * Sorteras med nyaste först.
 */
export async function timeline(
  options?: TimelineOptions,
): Promise<TimelineEntry[]> {
  const graph = await loadAuroraGraph();
  const limit = options?.limit ?? 20;

  let nodes = graph.nodes;

  // Filter by type
  if (options?.type) {
    nodes = nodes.filter((n) => n.type === options.type);
  }

  // Filter by scope
  if (options?.scope) {
    nodes = nodes.filter((n) => n.scope === options.scope);
  }

  // Filter by since
  if (options?.since) {
    const since = options.since;
    nodes = nodes.filter((n) => n.created >= since);
  }

  // Filter by until
  if (options?.until) {
    const until = options.until;
    nodes = nodes.filter((n) => n.created <= until);
  }

  // Sort by created descending (newest first)
  nodes = [...nodes].sort(
    (a, b) => b.created.localeCompare(a.created),
  );

  // Limit
  nodes = nodes.slice(0, limit);

  // Map to TimelineEntry
  return nodes.map((node) => ({
    id: node.id,
    title: node.title,
    type: node.type,
    createdAt: node.created,
    scope: node.scope,
    confidence: node.confidence,
    ...(node.sourceUrl ? { source: node.sourceUrl } : {}),
  }));
}
