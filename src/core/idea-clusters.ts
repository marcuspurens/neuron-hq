/**
 * Idea clustering module for the knowledge graph.
 *
 * PURE module — no side effects, no graph mutation, no file I/O.
 * All functions take data in and return data out.
 */

import type { KnowledgeGraph, KGNode, KGEdge } from './knowledge-graph.js';
import { computePriority } from './knowledge-graph.js';
import { createLogger } from './logger.js';

const logger = createLogger('idea-clusters');

// ── Types ────────────────────────────────────────────────

export interface IdeaCluster {
  id: string;               // 'cluster-001', 'cluster-002', ...
  label: string;            // cluster name (max 60 chars)
  memberIds: string[];      // idea node IDs in the cluster
  avgImpact: number;        // mean of members' impact
  avgEffort: number;        // mean of members' effort
  avgRisk: number;          // mean of members' risk
  topPriority: number;      // highest priority among members
  memberCount: number;      // number of ideas
}

export interface ClusterResult {
  clusters: IdeaCluster[];
  unclustered: string[];    // idea IDs not in any cluster
  archived: string[];       // idea IDs identified for archival
  stats: {
    totalIdeas: number;
    clusteredCount: number;
    unclusteredCount: number;
    archivedCount: number;
    clusterCount: number;
  };
}

// ── Stopwords ────────────────────────────────────────────

const SWEDISH_STOPWORDS = new Set([
  'och', 'att', 'är', 'det', 'en', 'ett', 'som', 'har', 'inte', 'med',
  'för', 'den', 'till', 'var', 'han', 'hon', 'kan', 'ska', 'från', 'men',
  'om', 'sig', 'sina', 'hur', 'alla', 'andra', 'blev', 'bli', 'blir',
  'där', 'denna', 'dessa', 'dig', 'din', 'ditt', 'efter', 'eller', 'era',
  'ert', 'fem', 'fick', 'finns', 'fyra', 'genom', 'ger', 'gjort',
  'hade', 'henne', 'här', 'hos', 'igen', 'ingen', 'när', 'redan', 'sedan',
  'ska', 'skulle', 'också', 'över',
]);

const ENGLISH_STOPWORDS = new Set([
  'the', 'is', 'a', 'to', 'of', 'for', 'in', 'on', 'with', 'that',
  'this', 'from', 'and', 'or', 'but', 'not', 'are', 'was', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'an', 'it',
  'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he', 'she',
  'him', 'her', 'by', 'at', 'if', 'so', 'no', 'up',
]);

const STOPWORDS = new Set([...SWEDISH_STOPWORDS, ...ENGLISH_STOPWORDS]);

/** Regex for splitting on whitespace and punctuation. */
const TOKEN_SPLIT = /[\s,;:!?(){}<>"'/\\|#*=+~^[\].-]+/;

// ── Helpers ──────────────────────────────────────────────

/**
 * Tokenize text for clustering. Lowercase, split on whitespace/punctuation,
 * filter stopwords and words < 3 chars.
 */
export function tokenizeForClustering(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((w) => w.length >= 3)
    .filter((w) => !STOPWORDS.has(w));
  return new Set(tokens);
}

/**
 * Compute Jaccard similarity between two token sets.
 * Returns 0 if either set is empty.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Get a numeric property from a node, with a default fallback.
 */
function getNumProp(node: KGNode, key: string, fallback: number): number {
  const val = node.properties[key];
  return typeof val === 'number' ? val : fallback;
}

/**
 * Zero-pad a cluster index to 3 digits.
 */
function padClusterId(index: number): string {
  return `cluster-${String(index).padStart(3, '0')}`;
}

/**
 * Generate a label from the most common tokens across cluster members.
 * Returns the top 3 tokens joined with ' / ', truncated to 60 chars.
 */
function generateClusterLabel(
  memberIds: string[],
  tokenMap: Map<string, Set<string>>,
): string {
  const freq = new Map<string, number>();
  for (const id of memberIds) {
    const tokens = tokenMap.get(id);
    if (!tokens) continue;
    for (const t of tokens) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const topTokens = sorted.slice(0, 3).map(([t]) => t);
  const label = topTokens.join(' / ');
  return label.length > 60 ? label.slice(0, 60) : label;
}

/**
 * Compute mean Jaccard similarity between a candidate's tokens
 * and all existing cluster members' tokens.
 */
function meanSimilarityToCluster(
  candidateTokens: Set<string>,
  clusterMemberIds: string[],
  tokenMap: Map<string, Set<string>>,
): number {
  if (clusterMemberIds.length === 0) return 0;
  let total = 0;
  for (const memberId of clusterMemberIds) {
    const memberTokens = tokenMap.get(memberId);
    if (!memberTokens) continue;
    total += jaccardSimilarity(candidateTokens, memberTokens);
  }
  return total / clusterMemberIds.length;
}

// ── Function 1: clusterIdeas ─────────────────────────────

export function clusterIdeas(
  graph: KnowledgeGraph,
  options?: {
    similarityThreshold?: number;
    minClusterSize?: number;
    maxClusters?: number;
  },
): ClusterResult {
  const threshold = options?.similarityThreshold ?? 0.3;
  const minClusterSize = options?.minClusterSize ?? 3;
  const maxClusters = options?.maxClusters ?? 120;

  // Step 1: Filter — get all idea nodes not rejected
  const ideaNodes = graph.nodes.filter(
    (n) => n.type === 'idea' && n.properties.status !== 'rejected',
  );

  if (ideaNodes.length === 0) {
    return {
      clusters: [],
      unclustered: [],
      archived: [],
      stats: {
        totalIdeas: 0,
        clusteredCount: 0,
        unclusteredCount: 0,
        archivedCount: 0,
        clusterCount: 0,
      },
    };
  }

  // Step 2: Tokenize
  const tokenMap = new Map<string, Set<string>>();
  for (const node of ideaNodes) {
    const text = node.title + ' ' + (typeof node.properties.description === 'string' ? node.properties.description : '');
    tokenMap.set(node.id, tokenizeForClustering(text));
  }

  // Step 3: Pairwise similarities
  const pairs: Array<{ a: string; b: string; sim: number }> = [];
  const ideaIds = ideaNodes.map((n) => n.id);
  for (let i = 0; i < ideaIds.length; i++) {
    for (let j = i + 1; j < ideaIds.length; j++) {
      const tokA = tokenMap.get(ideaIds[i])!;
      const tokB = tokenMap.get(ideaIds[j])!;
      const sim = jaccardSimilarity(tokA, tokB);
      if (sim >= threshold) {
        pairs.push({ a: ideaIds[i], b: ideaIds[j], sim });
      }
    }
  }

  // Sort descending by similarity
  pairs.sort((x, y) => y.sim - x.sim);

  // Step 4: Greedy clustering
  const nodeToCluster = new Map<string, number>(); // node ID → cluster index
  const clusterMembers: string[][] = []; // cluster index → member IDs

  for (const pair of pairs) {
    const clusterA = nodeToCluster.get(pair.a);
    const clusterB = nodeToCluster.get(pair.b);

    if (clusterA === undefined && clusterB === undefined) {
      // Both unclustered → create new cluster
      const idx = clusterMembers.length;
      clusterMembers.push([pair.a, pair.b]);
      nodeToCluster.set(pair.a, idx);
      nodeToCluster.set(pair.b, idx);
    } else if (clusterA !== undefined && clusterB === undefined) {
      // A is in a cluster, B is not → try to add B
      const tokB = tokenMap.get(pair.b)!;
      const meanSim = meanSimilarityToCluster(tokB, clusterMembers[clusterA], tokenMap);
      if (meanSim >= threshold * 0.8) {
        clusterMembers[clusterA].push(pair.b);
        nodeToCluster.set(pair.b, clusterA);
      }
    } else if (clusterA === undefined && clusterB !== undefined) {
      // B is in a cluster, A is not → try to add A
      const tokA = tokenMap.get(pair.a)!;
      const meanSim = meanSimilarityToCluster(tokA, clusterMembers[clusterB], tokenMap);
      if (meanSim >= threshold * 0.8) {
        clusterMembers[clusterB].push(pair.a);
        nodeToCluster.set(pair.a, clusterB);
      }
    }
    // Both already clustered → skip
  }

  // Step 5: Filter small clusters → move their ideas to unclustered
  const validClusters: string[][] = [];
  const unclustered = new Set<string>();

  for (const members of clusterMembers) {
    if (members.length >= minClusterSize) {
      validClusters.push(members);
    } else {
      for (const id of members) {
        unclustered.add(id);
      }
    }
  }

  // Add ideas that were never assigned to any cluster
  for (const id of ideaIds) {
    if (!nodeToCluster.has(id)) {
      unclustered.add(id);
    }
  }

  // Step 6: Cap clusters — keep top by member count
  validClusters.sort((a, b) => b.length - a.length);
  const cappedClusters = validClusters.slice(0, maxClusters);

  // Move excess cluster members to unclustered
  for (const excess of validClusters.slice(maxClusters)) {
    for (const id of excess) {
      unclustered.add(id);
    }
  }

  // Step 7: Compute metrics and build IdeaCluster objects
  const nodeMap = new Map<string, KGNode>();
  for (const node of ideaNodes) {
    nodeMap.set(node.id, node);
  }

  const clusters: IdeaCluster[] = cappedClusters.map((memberIds, idx) => {
    let totalImpact = 0;
    let totalEffort = 0;
    let totalRisk = 0;
    let topPriority = -Infinity;

    for (const id of memberIds) {
      const node = nodeMap.get(id)!;
      const impact = getNumProp(node, 'impact', 3);
      const effort = getNumProp(node, 'effort', 3);
      const risk = getNumProp(node, 'risk', 3);
      totalImpact += impact;
      totalEffort += effort;
      totalRisk += risk;
      const priority = computePriority(impact, effort, risk);
      if (priority > topPriority) topPriority = priority;
    }

    const count = memberIds.length;
    return {
      id: padClusterId(idx + 1),
      label: generateClusterLabel(memberIds, tokenMap),
      memberIds,
      avgImpact: parseFloat((totalImpact / count).toFixed(2)),
      avgEffort: parseFloat((totalEffort / count).toFixed(2)),
      avgRisk: parseFloat((totalRisk / count).toFixed(2)),
      topPriority,
      memberCount: count,
    };
  });

  // Get archive candidates
  const archived = identifyArchiveCandidates(graph);

  const clusteredCount = clusters.reduce((sum, c) => sum + c.memberCount, 0);
  const unclusteredArr = [...unclustered];

  logger.debug('Clustering complete', {
    totalIdeas: String(ideaNodes.length),
    clusters: String(clusters.length),
    clustered: String(clusteredCount),
    unclustered: String(unclusteredArr.length),
    archived: String(archived.length),
  });

  return {
    clusters,
    unclustered: unclusteredArr,
    archived,
    stats: {
      totalIdeas: ideaNodes.length,
      clusteredCount,
      unclusteredCount: unclusteredArr.length,
      archivedCount: archived.length,
      clusterCount: clusters.length,
    },
  };
}

// ── Function 2: createMetaIdeas ──────────────────────────

export function createMetaIdeas(
  graph: KnowledgeGraph,
  clusters: IdeaCluster[],
): { newNodes: KGNode[]; newEdges: KGEdge[] } {
  const existingIds = new Set(graph.nodes.map((n) => n.id));
  const newNodes: KGNode[] = [];
  const newEdges: KGEdge[] = [];
  const now = new Date().toISOString();

  for (const cluster of clusters) {
    const metaId = `idea-meta-${cluster.id}`;

    // Skip if already exists (idempotent)
    if (existingIds.has(metaId)) continue;

    const node: KGNode = {
      id: metaId,
      type: 'idea',
      title: `[Kluster] ${cluster.label}`,
      confidence: 0.6,
      scope: 'project-specific',
      properties: {
        description: `Kluster av ${cluster.memberCount} relaterade idéer: ${cluster.label}`,
        impact: Math.round(cluster.avgImpact),
        effort: Math.round(cluster.avgEffort),
        risk: Math.round(cluster.avgRisk),
        status: 'proposed',
        group: 'Kluster',
        provenance: 'agent',
        is_meta: true,
        member_count: cluster.memberCount,
        member_ids: cluster.memberIds,
      },
      created: now,
      updated: now,
      model: null,
    };
    newNodes.push(node);

    for (const memberId of cluster.memberIds) {
      const edge: KGEdge = {
        from: metaId,
        to: memberId,
        type: 'related_to',
        metadata: {
          agent: 'consolidator',
          timestamp: now,
        },
      };
      newEdges.push(edge);
    }
  }

  logger.debug('Meta ideas created', {
    nodes: String(newNodes.length),
    edges: String(newEdges.length),
  });

  return { newNodes, newEdges };
}

// ── Function 3: identifyArchiveCandidates ────────────────

export function identifyArchiveCandidates(graph: KnowledgeGraph): string[] {
  // Build set of idea IDs that have outgoing inspired_by or used_by edges
  const hasOutgoingEdge = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type === 'inspired_by' || edge.type === 'used_by') {
      hasOutgoingEdge.add(edge.from);
    }
  }

  return graph.nodes
    .filter((n) => {
      if (n.type !== 'idea') return false;
      if (n.confidence > 0.3) return false;
      const mentionCount = n.properties.mention_count;
      const hasFewMentions =
        mentionCount === undefined ||
        mentionCount === null ||
        (typeof mentionCount === 'number' && mentionCount <= 1);
      if (!hasFewMentions) return false;
      if (n.properties.status !== 'proposed') return false;
      if (hasOutgoingEdge.has(n.id)) return false;
      return true;
    })
    .map((n) => n.id);
}

// ── Function 4: generateConsolidationReport ──────────────

export function generateConsolidationReport(
  result: ClusterResult,
  clusters: IdeaCluster[],
  graph: KnowledgeGraph,
): string {
  const { stats } = result;
  const nodeMap = new Map<string, KGNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const lines: string[] = [];
  lines.push('# Idékonsolidering — Rapport');
  lines.push('');
  lines.push('## Sammanfattning');
  lines.push('');
  lines.push(`- **Totalt antal idéer:** ${stats.totalIdeas}`);
  lines.push(`- **Klustrade:** ${stats.clusteredCount} (i ${stats.clusterCount} kluster)`);
  lines.push(`- **Oklustrade:** ${stats.unclusteredCount}`);
  lines.push(`- **Arkiverade:** ${stats.archivedCount}`);
  lines.push(`- **Meta-idéer skapade:** ${stats.clusterCount}`);
  lines.push('');

  // Top-10 clusters by topPriority descending
  const sortedByPriority = [...clusters].sort((a, b) => b.topPriority - a.topPriority);
  const top10 = sortedByPriority.slice(0, 10);

  lines.push('## Topp-10 kluster (efter topPriority)');
  lines.push('');
  lines.push('| # | Kluster | Medlemmar | Snitt-impact | Snitt-effort | Topp-prio |');
  lines.push('|---|---------|-----------|-------------|-------------|-----------|');
  top10.forEach((c, i) => {
    lines.push(
      `| ${i + 1} | ${c.label} | ${c.memberCount} | ${c.avgImpact.toFixed(1)} | ${c.avgEffort.toFixed(1)} | ${c.topPriority.toFixed(1)} |`,
    );
  });
  lines.push('');

  // All clusters section
  lines.push('## Alla kluster');
  lines.push('');
  for (const cluster of clusters) {
    lines.push(`### ${cluster.id}: ${cluster.label} (${cluster.memberCount} idéer)`);
    const displayMembers = cluster.memberIds.slice(0, 10);
    for (const memberId of displayMembers) {
      const node = nodeMap.get(memberId);
      if (node) {
        const impact = getNumProp(node, 'impact', 3);
        const effort = getNumProp(node, 'effort', 3);
        lines.push(`- ${memberId}: ${node.title} (impact: ${impact}, effort: ${effort})`);
      } else {
        lines.push(`- ${memberId}: (nod saknas)`);
      }
    }
    if (cluster.memberIds.length > 10) {
      lines.push(`- ... och ${cluster.memberIds.length - 10} till`);
    }
    lines.push('');
  }

  // Archived ideas
  lines.push(`## Arkiverade idéer (${result.archived.length})`);
  lines.push('');
  if (result.archived.length > 0) {
    lines.push('| ID | Titel | Anledning |');
    lines.push('|----|-------|-----------|');
    for (const id of result.archived) {
      const node = nodeMap.get(id);
      if (node) {
        const mentionCount = typeof node.properties.mention_count === 'number'
          ? node.properties.mention_count
          : 0;
        lines.push(
          `| ${id} | ${node.title} | confidence ${node.confidence}, mention_count ${mentionCount}, inga utgående kanter |`,
        );
      }
    }
  }
  lines.push('');

  return lines.join('\n');
}
