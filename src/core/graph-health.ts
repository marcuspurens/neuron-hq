import type { KnowledgeGraph } from './knowledge-graph.js';
import {
  findDuplicateCandidates,
  findStaleNodes,
  findMissingEdges,
} from './graph-merge.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HealthCheckResult {
  status: 'GREEN' | 'YELLOW' | 'RED';
  timestamp: string;
  summary: {
    totalNodes: number;
    totalEdges: number;
    /** totalEdges / totalNodes (0 if no nodes) */
    edgesPerNode: number;
  };
  checks: {
    isolatedNodes: IsolatedNodesCheck;
    duplicates: DuplicatesCheck;
    brokenEdges: BrokenEdgesCheck;
    staleLowConfidence: StaleCheck;
    missingProvenance: ProvenanceCheck;
    unknownScope: ScopeCheck;
    missingEdges: MissingEdgesCheck;
  };
  /** Max 5 recommendations, sorted by severity (RED first, then YELLOW). */
  recommendations: string[];
}

export interface IsolatedNodesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  percentage: number;
  /** All node types present in the graph, including those with no isolated nodes. */
  byType: Record<string, { count: number; total: number; percentage: number }>;
}

export interface DuplicatesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  candidateCount: number;
  topCandidates: Array<{ nodeA: string; nodeB: string; similarity: number }>;
}

export interface BrokenEdgesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  brokenEdges: Array<{ from: string; to: string; type: string }>;
}

export interface StaleCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  nodes: Array<{ id: string; title: string; confidence: number; lastUpdated: string }>;
}

export interface ProvenanceCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  byType: Record<string, number>;
}

export interface ScopeCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  byType: Record<string, number>;
}

export interface MissingEdgesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  topCandidates: Array<{ from: string; to: string; sharedNeighbors: number }>;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type Status = 'GREEN' | 'YELLOW' | 'RED';

/** Returns the most severe status among the provided values. */
function worstStatus(statuses: Status[]): Status {
  if (statuses.includes('RED')) return 'RED';
  if (statuses.includes('YELLOW')) return 'YELLOW';
  return 'GREEN';
}

const STATUS_EMOJI: Record<Status, string> = {
  GREEN: '🟢',
  YELLOW: '🟡',
  RED: '🔴',
};

// ---------------------------------------------------------------------------
// Individual check implementations
// ---------------------------------------------------------------------------

/**
 * Check for isolated nodes (nodes that appear in no edge).
 * RED if >50%, YELLOW if >25%, GREEN otherwise.
 */
function checkIsolatedNodes(graph: KnowledgeGraph): IsolatedNodesCheck {
  const totalNodes = graph.nodes.length;

  if (totalNodes === 0) {
    return { status: 'GREEN', count: 0, percentage: 0, byType: {} };
  }

  // Build set of node IDs that appear in at least one edge
  const connectedIds = new Set<string>();
  for (const edge of graph.edges) {
    connectedIds.add(edge.from);
    connectedIds.add(edge.to);
  }

  // Accumulate by type: total and isolated count
  const byTypeRaw: Record<string, { count: number; total: number }> = {};
  let isolatedCount = 0;

  for (const node of graph.nodes) {
    if (!byTypeRaw[node.type]) {
      byTypeRaw[node.type] = { count: 0, total: 0 };
    }
    byTypeRaw[node.type].total++;

    if (!connectedIds.has(node.id)) {
      isolatedCount++;
      byTypeRaw[node.type].count++;
    }
  }

  // Build final byType record with percentage
  const byType: Record<string, { count: number; total: number; percentage: number }> = {};
  for (const [type, { count, total }] of Object.entries(byTypeRaw)) {
    byType[type] = {
      count,
      total,
      percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0,
    };
  }

  const percentage = parseFloat(((isolatedCount / totalNodes) * 100).toFixed(1));
  const status: Status =
    percentage > 50 ? 'RED' : percentage > 25 ? 'YELLOW' : 'GREEN';

  return { status, count: isolatedCount, percentage, byType };
}

/**
 * Check for duplicate nodes using title similarity.
 * RED if >20 candidates, YELLOW if >5, GREEN otherwise.
 */
function checkDuplicates(graph: KnowledgeGraph): DuplicatesCheck {
  const candidates = findDuplicateCandidates(graph);
  const candidateCount = candidates.length;
  const topCandidates = candidates.slice(0, 10);
  const status: Status =
    candidateCount > 20 ? 'RED' : candidateCount > 5 ? 'YELLOW' : 'GREEN';
  return { status, candidateCount, topCandidates };
}

/**
 * Check for edges referencing non-existent nodes.
 * RED if any broken edge exists.
 */
function checkBrokenEdges(graph: KnowledgeGraph): BrokenEdgesCheck {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const broken: Array<{ from: string; to: string; type: string }> = [];

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      broken.push({ from: edge.from, to: edge.to, type: edge.type });
    }
  }

  const count = broken.length;
  const status: Status = count > 0 ? 'RED' : 'GREEN';
  return { status, count, brokenEdges: broken.slice(0, 20) };
}

/**
 * Check for stale nodes with low confidence.
 * RED if >50, YELLOW if >10, GREEN otherwise.
 */
function checkStaleLowConfidence(graph: KnowledgeGraph): StaleCheck {
  const stale = findStaleNodes(graph);
  const count = stale.length;
  const nodes = stale.slice(0, 20).map((n) => ({
    id: n.id,
    title: n.title,
    confidence: n.confidence,
    lastUpdated: n.updated,
  }));
  const status: Status = count > 50 ? 'RED' : count > 10 ? 'YELLOW' : 'GREEN';
  return { status, count, nodes };
}

/**
 * Check for pattern/error/technique nodes missing a 'discovered_in' edge to a run node.
 * RED if >25%, YELLOW if >10%, GREEN otherwise.
 */
function checkMissingProvenance(graph: KnowledgeGraph): ProvenanceCheck {
  const PROVENANCE_TYPES = new Set(['pattern', 'error', 'technique']);

  // Build set of run node IDs for quick lookup
  const runNodeIds = new Set(
    graph.nodes.filter((n) => n.type === 'run').map((n) => n.id),
  );

  // Find pattern/error/technique nodes
  const targetNodes = graph.nodes.filter((n) => PROVENANCE_TYPES.has(n.type));
  const totalTarget = targetNodes.length;

  if (totalTarget === 0) {
    return { status: 'GREEN', count: 0, byType: {} };
  }

  // Build set of node IDs that have a discovered_in edge connecting to a run node
  const hasProvenance = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type !== 'discovered_in') continue;
    // Edge from target node to run node
    if (PROVENANCE_TYPES.has(graph.nodes.find((n) => n.id === edge.from)?.type ?? '') &&
        runNodeIds.has(edge.to)) {
      hasProvenance.add(edge.from);
    }
    // Edge from run node to target node
    if (runNodeIds.has(edge.from) &&
        PROVENANCE_TYPES.has(graph.nodes.find((n) => n.id === edge.to)?.type ?? '')) {
      hasProvenance.add(edge.to);
    }
  }

  // Count missing by type
  const byType: Record<string, number> = {};
  let missingCount = 0;
  for (const node of targetNodes) {
    if (!hasProvenance.has(node.id)) {
      missingCount++;
      byType[node.type] = (byType[node.type] ?? 0) + 1;
    }
  }

  const percentage = parseFloat(((missingCount / totalTarget) * 100).toFixed(1));
  const status: Status =
    percentage > 25 ? 'RED' : percentage > 10 ? 'YELLOW' : 'GREEN';

  return { status, count: missingCount, byType };
}

/**
 * Check for nodes with unknown scope.
 * RED if >25%, YELLOW if >10%, GREEN otherwise.
 */
function checkUnknownScope(graph: KnowledgeGraph): ScopeCheck {
  const totalNodes = graph.nodes.length;

  if (totalNodes === 0) {
    return { status: 'GREEN', count: 0, byType: {} };
  }

  const byType: Record<string, number> = {};
  let unknownCount = 0;
  for (const node of graph.nodes) {
    if (node.scope === 'unknown') {
      unknownCount++;
      byType[node.type] = (byType[node.type] ?? 0) + 1;
    }
  }

  const percentage = parseFloat(((unknownCount / totalNodes) * 100).toFixed(1));
  const status: Status =
    percentage > 25 ? 'RED' : percentage > 10 ? 'YELLOW' : 'GREEN';

  return { status, count: unknownCount, byType };
}

/**
 * Check for pairs of nodes that share neighbors but lack a direct edge.
 * YELLOW if >20 candidates, GREEN otherwise (NEVER RED).
 */
function checkMissingEdges(graph: KnowledgeGraph): MissingEdgesCheck {
  const candidates = findMissingEdges(graph);
  const count = candidates.length;
  const topCandidates = candidates.slice(0, 10);
  const status: Status = count > 20 ? 'YELLOW' : 'GREEN';
  return { status, count, topCandidates };
}

// ---------------------------------------------------------------------------
// Recommendation generation
// ---------------------------------------------------------------------------

interface CheckEntry {
  status: Status;
  recommendation: string;
}

function buildRecommendations(
  checks: HealthCheckResult['checks'],
): string[] {
  const entries: CheckEntry[] = [];

  // Isolated nodes: find the type with the most isolated nodes
  if (checks.isolatedNodes.status !== 'GREEN') {
    let worstType = '';
    let worstCount = 0;
    for (const [type, data] of Object.entries(checks.isolatedNodes.byType)) {
      if (data.count > worstCount) {
        worstCount = data.count;
        worstType = type;
      }
    }
    const typeHint =
      worstType
        ? ` ${worstCount} av ${checks.isolatedNodes.byType[worstType]?.total ?? 0} ${worstType}-noder saknar kopplingar.`
        : '';
    entries.push({
      status: checks.isolatedNodes.status,
      recommendation: `Isolerade noder: ${checks.isolatedNodes.count} noder (${checks.isolatedNodes.percentage}%) saknar kanter.${typeHint} Kör Consolidator med fokus på att koppla ${worstType || 'lösa'}-noder.`,
    });
  }

  // Duplicates
  if (checks.duplicates.status !== 'GREEN') {
    entries.push({
      status: checks.duplicates.status,
      recommendation: `Dubbletter: ${checks.duplicates.candidateCount} kandidatpar hittades. Kör Consolidator för att slå ihop dubbletter.`,
    });
  }

  // Broken edges
  if (checks.brokenEdges.status !== 'GREEN') {
    entries.push({
      status: checks.brokenEdges.status,
      recommendation: `Trasiga kanter: ${checks.brokenEdges.count} kant(er) refererar till saknade noder. Åtgärda omedelbart — kör en gravrensning.`,
    });
  }

  // Stale low-confidence
  if (checks.staleLowConfidence.status !== 'GREEN') {
    entries.push({
      status: checks.staleLowConfidence.status,
      recommendation: `Inaktuella noder: ${checks.staleLowConfidence.count} noder har lågt förtroende och är föråldrade. Arkivera eller granska dem.`,
    });
  }

  // Missing provenance
  if (checks.missingProvenance.status !== 'GREEN') {
    entries.push({
      status: checks.missingProvenance.status,
      recommendation: `Saknad proveniens: ${checks.missingProvenance.count} pattern/error/technique-noder saknar koppling till en run-nod. Låt Historian fixa detta.`,
    });
  }

  // Unknown scope
  if (checks.unknownScope.status !== 'GREEN') {
    entries.push({
      status: checks.unknownScope.status,
      recommendation: `Okänt scope: ${checks.unknownScope.count} noder har scope='unknown'. Kör Consolidator för att scope-tagga dem.`,
    });
  }

  // Missing edges
  if (checks.missingEdges.status !== 'GREEN') {
    entries.push({
      status: checks.missingEdges.status,
      recommendation: `Saknade kanter: ${checks.missingEdges.count} nodpar delar grannar utan direkt koppling. Kör Consolidator för att skapa saknade länkar.`,
    });
  }

  // Sort: RED first, then YELLOW
  entries.sort((a, b) => {
    const order: Record<Status, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
    return order[a.status] - order[b.status];
  });

  return entries.slice(0, 5).map((e) => e.recommendation);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all 7 health checks on the knowledge graph and return a complete result.
 * This function is pure — no side effects, no file I/O.
 */
export function runHealthCheck(graph: KnowledgeGraph): HealthCheckResult {
  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;
  const edgesPerNode = totalNodes > 0 ? parseFloat((totalEdges / totalNodes).toFixed(2)) : 0;

  const isolatedNodes = checkIsolatedNodes(graph);
  const duplicates = checkDuplicates(graph);
  const brokenEdges = checkBrokenEdges(graph);
  const staleLowConfidence = checkStaleLowConfidence(graph);
  const missingProvenance = checkMissingProvenance(graph);
  const unknownScope = checkUnknownScope(graph);
  const missingEdges = checkMissingEdges(graph);

  const checks: HealthCheckResult['checks'] = {
    isolatedNodes,
    duplicates,
    brokenEdges,
    staleLowConfidence,
    missingProvenance,
    unknownScope,
    missingEdges,
  };

  const status = worstStatus([
    isolatedNodes.status,
    duplicates.status,
    brokenEdges.status,
    staleLowConfidence.status,
    missingProvenance.status,
    unknownScope.status,
    missingEdges.status,
  ]);

  const recommendations = buildRecommendations(checks);

  return {
    status,
    timestamp: new Date().toISOString(),
    summary: { totalNodes, totalEdges, edgesPerNode },
    checks,
    recommendations,
  };
}

/**
 * Convert a HealthCheckResult to a formatted markdown report.
 */
export function generateHealthReport(result: HealthCheckResult): string {
  const { status, timestamp, summary, checks, recommendations } = result;
  const emoji = STATUS_EMOJI[status];

  const edgesPerNodeStr = summary.edgesPerNode.toFixed(2);

  // --- Summary table rows ---
  function checkRow(
    name: string,
    checkStatus: Status,
    details: string,
  ): string {
    return `| ${name} | ${STATUS_EMOJI[checkStatus]} ${checkStatus} | ${details} |`;
  }

  const { isolatedNodes, duplicates, brokenEdges, staleLowConfidence,
    missingProvenance, unknownScope, missingEdges } = checks;

  const tableRows = [
    checkRow(
      'Isolerade noder',
      isolatedNodes.status,
      `${isolatedNodes.count} av ${summary.totalNodes} (${isolatedNodes.percentage}%)`,
    ),
    checkRow(
      'Dubbletter',
      duplicates.status,
      `${duplicates.candidateCount} kandidater`,
    ),
    checkRow(
      'Trasiga kanter',
      brokenEdges.status,
      `${brokenEdges.count} trasiga kanter`,
    ),
    checkRow(
      'Inaktuella noder',
      staleLowConfidence.status,
      `${staleLowConfidence.count} noder`,
    ),
    checkRow(
      'Saknad proveniens',
      missingProvenance.status,
      `${missingProvenance.count} noder`,
    ),
    checkRow(
      'Okänt scope',
      unknownScope.status,
      `${unknownScope.count} noder`,
    ),
    checkRow(
      'Saknade kanter',
      missingEdges.status,
      `${missingEdges.count} kandidater`,
    ),
  ].join('\n');

  // --- Recommendations section ---
  const recSection =
    recommendations.length > 0
      ? recommendations
          .map((rec, i) => `${i + 1}. ${rec}`)
          .join('\n')
      : '_Inga rekommendationer — grafen ser bra ut!_';

  // --- Isolated nodes by type table ---
  const isolatedByTypeRows = Object.entries(isolatedNodes.byType)
    .map(([type, { count, total, percentage }]) =>
      `| ${type} | ${count} | ${total} | ${percentage}% |`,
    )
    .join('\n');

  const isolatedByTypeTable =
    isolatedByTypeRows.length > 0
      ? `| Typ | Isolerade | Totalt | % |\n|-----|-----------|--------|---|\n${isolatedByTypeRows}`
      : '_Inga noder._';

  // --- Duplicates top candidates ---
  const dupSection =
    duplicates.topCandidates.length > 0
      ? duplicates.topCandidates
          .map(
            (c, i) =>
              `${i + 1}. \`${c.nodeA}\` ↔ \`${c.nodeB}\` (likhet: ${(c.similarity * 100).toFixed(0)}%)`,
          )
          .join('\n')
      : '_Inga kandidater._';

  // --- Stale nodes section ---
  const staleSection =
    staleLowConfidence.nodes.length > 0
      ? staleLowConfidence.nodes
          .map(
            (n) =>
              `- \`${n.id}\` — ${n.title} (confidence: ${n.confidence}, uppdaterad: ${n.lastUpdated.substring(0, 10)})`,
          )
          .join('\n')
      : '_Inga inaktuella noder._';

  // --- Missing provenance by type ---
  const provByTypeRows = Object.entries(missingProvenance.byType)
    .map(([type, count]) => `| ${type} | ${count} |`)
    .join('\n');
  const provByTypeTable =
    provByTypeRows.length > 0
      ? `| Typ | Saknar proveniens |\n|-----|-------------------|\n${provByTypeRows}`
      : '_Inga saknade proveniensnoder._';

  // --- Unknown scope by type ---
  const scopeByTypeRows = Object.entries(unknownScope.byType)
    .map(([type, count]) => `| ${type} | ${count} |`)
    .join('\n');
  const scopeByTypeTable =
    scopeByTypeRows.length > 0
      ? `| Typ | Okänt scope |\n|-----|-------------|\n${scopeByTypeRows}`
      : '_Inga noder med okänt scope._';

  // --- Missing edges top candidates ---
  const missingEdgesSection =
    missingEdges.topCandidates.length > 0
      ? missingEdges.topCandidates
          .map(
            (c, i) =>
              `${i + 1}. \`${c.from}\` ↔ \`${c.to}\` (gemensamma grannar: ${c.sharedNeighbors})`,
          )
          .join('\n')
      : '_Inga kandidater._';

  return `# Grafens hälsorapport

**Status:** ${emoji} ${status}
**Tidpunkt:** ${timestamp}
**Noder:** ${summary.totalNodes} | **Kanter:** ${summary.totalEdges} | **Kanter/nod:** ${edgesPerNodeStr}

## Checks

| Check | Status | Detaljer |
|-------|--------|----------|
${tableRows}

## Rekommendationer

${recSection}

## Detaljer per check

### Isolerade noder (${isolatedNodes.count})

${isolatedByTypeTable}

### Dubbletter (topp-10)

${dupSection}

### Stale low-confidence (${staleLowConfidence.count})

${staleSection}

### Saknad proveniens (${missingProvenance.count})

${provByTypeTable}

### Okänt scope (${unknownScope.count})

${scopeByTypeTable}

### Saknade kanter (topp-10)

${missingEdgesSection}
`;
}

/**
 * Inject a health trigger into a brief if graph health is RED.
 * Returns the original brief unchanged for YELLOW or GREEN status.
 */
export function maybeInjectHealthTrigger(
  briefContent: string,
  healthStatus: 'GREEN' | 'YELLOW' | 'RED',
): string {
  if (healthStatus === 'RED') {
    return (
      briefContent +
      '\n\n⚡ Health-trigger: Graph health is RED. After Historian completes, delegate to Consolidator with graph-health report as context.'
    );
  }
  return briefContent;
}
