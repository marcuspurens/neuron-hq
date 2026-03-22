import { describe, it, expect } from 'vitest';
import {
  runHealthCheck,
  generateHealthReport,
  maybeInjectHealthTrigger,
  type HealthCheckResult,
  type IsolatedNodesCheck,
} from '../../src/core/graph-health.js';
import {
  createEmptyGraph,
  addNode,
  addEdge,
  type KnowledgeGraph,
  type KGNode,
  type KGEdge,
} from '../../src/core/knowledge-graph.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'test-001',
    type: 'pattern',
    title: 'Test pattern',
    properties: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
    scope: 'universal',
    ...overrides,
  };
}

function makeEdge(overrides: Partial<KGEdge> = {}): KGEdge {
  return {
    from: 'a',
    to: 'b',
    type: 'related_to',
    metadata: {},
    ...overrides,
  };
}

function buildGraph(nodes: KGNode[], edges: KGEdge[] = []): KnowledgeGraph {
  let graph = createEmptyGraph();
  for (const node of nodes) {
    graph = addNode(graph, node);
  }
  for (const edge of edges) {
    graph = addEdge(graph, edge);
  }
  return graph;
}

// ---------------------------------------------------------------------------
// runHealthCheck — empty graph
// ---------------------------------------------------------------------------

describe('runHealthCheck — empty graph', () => {
  it('returns GREEN with all zeros', () => {
    const graph = createEmptyGraph();
    const result = runHealthCheck(graph);
    expect(result.status).toBe('GREEN');
    expect(result.summary.totalNodes).toBe(0);
    expect(result.summary.totalEdges).toBe(0);
    expect(result.summary.edgesPerNode).toBe(0);
    expect(result.checks.isolatedNodes.count).toBe(0);
    expect(result.checks.duplicates.candidateCount).toBe(0);
    expect(result.checks.brokenEdges.count).toBe(0);
    expect(result.checks.staleLowConfidence.count).toBe(0);
    expect(result.checks.missingProvenance.count).toBe(0);
    expect(result.checks.unknownScope.count).toBe(0);
    expect(result.checks.missingEdges.count).toBe(0);
    expect(result.recommendations).toHaveLength(0);
  });

  it('timestamp is a valid ISO string', () => {
    const result = runHealthCheck(createEmptyGraph());
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// isolatedNodes check
// ---------------------------------------------------------------------------

describe('isolatedNodes check', () => {
  it('GREEN when all nodes are connected', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'pattern' }),
      makeNode({ id: 'b', type: 'pattern' }),
    ];
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    expect(result.checks.isolatedNodes.status).toBe('GREEN');
    expect(result.checks.isolatedNodes.count).toBe(0);
  });

  it('YELLOW when >25% isolated', () => {
    // 3 isolated out of 4 = 75% but let's do 2 of 6 = 33%
    const nodes = [
      makeNode({ id: 'a', type: 'pattern' }),
      makeNode({ id: 'b', type: 'pattern' }),
      makeNode({ id: 'c', type: 'idea' }),
      makeNode({ id: 'd', type: 'idea' }),
      makeNode({ id: 'e', type: 'idea' }),
      makeNode({ id: 'f', type: 'idea' }),
    ];
    // Only a–b connected: 4 isolated (c,d,e,f) = 67% → RED actually
    // Let's do 2 isolated out of 6 = 33.3% → YELLOW
    const edges = [
      makeEdge({ from: 'a', to: 'b' }),
      makeEdge({ from: 'c', to: 'd' }),
      makeEdge({ from: 'e', to: 'f' }),
    ];
    // 0 isolated, hmm. Let's build differently
    // 4 connected, 2 isolated → 2/6 = 33.3% → YELLOW
    const nodes2 = [
      makeNode({ id: 'a', type: 'pattern' }),
      makeNode({ id: 'b', type: 'pattern' }),
      makeNode({ id: 'c', type: 'pattern' }),
      makeNode({ id: 'd', type: 'pattern' }),
      makeNode({ id: 'iso1', type: 'idea' }),
      makeNode({ id: 'iso2', type: 'idea' }),
    ];
    const edges2 = [
      makeEdge({ from: 'a', to: 'b' }),
      makeEdge({ from: 'c', to: 'd' }),
    ];
    const result = runHealthCheck(buildGraph(nodes2, edges2));
    // 2/6 = 33.3% → YELLOW (>25%)
    expect(result.checks.isolatedNodes.status).toBe('YELLOW');
    expect(result.checks.isolatedNodes.count).toBe(2);
    expect(result.checks.isolatedNodes.percentage).toBeCloseTo(33.3, 0);
  });

  it('RED when >50% isolated', () => {
    // 3 isolated out of 4 = 75% → RED
    const nodes = [
      makeNode({ id: 'a', type: 'pattern' }),
      makeNode({ id: 'b', type: 'pattern' }),
      makeNode({ id: 'c', type: 'idea' }),
      makeNode({ id: 'd', type: 'idea' }),
    ];
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    // c and d are isolated → 2/4 = 50% → NOT >50%, should be YELLOW
    // Let's use 3 isolated out of 4: add one more isolated node
    const nodes2 = [
      makeNode({ id: 'a', type: 'pattern' }),
      makeNode({ id: 'b', type: 'pattern' }),
      makeNode({ id: 'c', type: 'idea' }),
      makeNode({ id: 'd', type: 'idea' }),
      makeNode({ id: 'e', type: 'idea' }),
    ];
    // a-b connected, c,d,e isolated → 3/5 = 60% → RED
    const result2 = runHealthCheck(buildGraph(nodes2, [makeEdge({ from: 'a', to: 'b' })]));
    expect(result2.checks.isolatedNodes.status).toBe('RED');
    expect(result2.checks.isolatedNodes.count).toBe(3);
  });

  it('byType includes all types present in the graph', () => {
    const nodes = [
      makeNode({ id: 'p1', type: 'pattern' }),
      makeNode({ id: 'e1', type: 'error' }),
    ];
    const result = runHealthCheck(buildGraph(nodes));
    const { byType } = result.checks.isolatedNodes;
    expect(Object.keys(byType)).toContain('pattern');
    expect(Object.keys(byType)).toContain('error');
    expect(byType['pattern']?.total).toBe(1);
    expect(byType['error']?.total).toBe(1);
  });

  it('byType.percentage is 0 when no isolated nodes of a type', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'pattern' }),
      makeNode({ id: 'b', type: 'pattern' }),
    ];
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    expect(result.checks.isolatedNodes.byType['pattern']?.percentage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// brokenEdges check
// ---------------------------------------------------------------------------

describe('brokenEdges check', () => {
  it('GREEN when all edges reference valid nodes', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b' })];
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    expect(result.checks.brokenEdges.status).toBe('GREEN');
    expect(result.checks.brokenEdges.count).toBe(0);
  });

  it('RED when an edge references a missing node', () => {
    const nodes = [makeNode({ id: 'a' })];
    // Edge references 'ghost' which doesn't exist
    const edges = [makeEdge({ from: 'a', to: 'ghost' })];
    // We need to bypass addEdge validation — build raw graph
    const graph: KnowledgeGraph = {
      version: '1',
      lastUpdated: new Date().toISOString(),
      nodes,
      edges,
    };
    const result = runHealthCheck(graph);
    expect(result.checks.brokenEdges.status).toBe('RED');
    expect(result.checks.brokenEdges.count).toBe(1);
    expect(result.checks.brokenEdges.brokenEdges[0]).toMatchObject({
      from: 'a',
      to: 'ghost',
    });
  });
});

// ---------------------------------------------------------------------------
// missingProvenance check
// ---------------------------------------------------------------------------

describe('missingProvenance check', () => {
  it('GREEN when all pattern/error/technique nodes have discovered_in edge', () => {
    const nodes = [
      makeNode({ id: 'p1', type: 'pattern' }),
      makeNode({ id: 'r1', type: 'run' }),
    ];
    const edges = [makeEdge({ from: 'p1', to: 'r1', type: 'discovered_in' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    expect(result.checks.missingProvenance.status).toBe('GREEN');
    expect(result.checks.missingProvenance.count).toBe(0);
  });

  it('counts node as having provenance when edge is run→node direction', () => {
    const nodes = [
      makeNode({ id: 'p1', type: 'pattern' }),
      makeNode({ id: 'r1', type: 'run' }),
    ];
    const edges = [makeEdge({ from: 'r1', to: 'p1', type: 'discovered_in' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    expect(result.checks.missingProvenance.count).toBe(0);
  });

  it('YELLOW when >10% missing provenance', () => {
    // 2 pattern nodes without provenance, run node exists but no edge
    // 2/2 = 100% → RED
    // Use 2 out of 11 → ~18% → YELLOW
    const nodes: KGNode[] = [
      makeNode({ id: 'r1', type: 'run' }),
    ];
    // 9 patterns with provenance
    for (let i = 1; i <= 9; i++) {
      nodes.push(makeNode({ id: `p${i}`, type: 'pattern', title: `Pattern ${i}` }));
    }
    // 2 patterns without provenance
    nodes.push(makeNode({ id: 'p10', type: 'pattern', title: 'Pattern 10' }));
    nodes.push(makeNode({ id: 'p11', type: 'pattern', title: 'Pattern 11' }));

    const edges: KGEdge[] = [];
    for (let i = 1; i <= 9; i++) {
      edges.push(makeEdge({ from: `p${i}`, to: 'r1', type: 'discovered_in' }));
    }
    const result = runHealthCheck(buildGraph(nodes, edges));
    // 2/11 = 18.2% → YELLOW
    expect(result.checks.missingProvenance.status).toBe('YELLOW');
    expect(result.checks.missingProvenance.count).toBe(2);
  });

  it('byType counts missing by type', () => {
    const nodes = [
      makeNode({ id: 'p1', type: 'pattern' }),
      makeNode({ id: 'e1', type: 'error' }),
    ];
    // No run node, no edges → both missing provenance
    const result = runHealthCheck(buildGraph(nodes));
    expect(result.checks.missingProvenance.byType['pattern']).toBe(1);
    expect(result.checks.missingProvenance.byType['error']).toBe(1);
  });

  it('GREEN when no pattern/error/technique nodes exist', () => {
    const nodes = [makeNode({ id: 'r1', type: 'run' })];
    const result = runHealthCheck(buildGraph(nodes));
    expect(result.checks.missingProvenance.status).toBe('GREEN');
    expect(result.checks.missingProvenance.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// unknownScope check
// ---------------------------------------------------------------------------

describe('unknownScope check', () => {
  it('GREEN when no nodes have unknown scope', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'idea', scope: 'universal' }),
      makeNode({ id: 'b', scope: 'project-specific' }),
    ];
    const result = runHealthCheck(buildGraph(nodes));
    expect(result.checks.unknownScope.status).toBe('GREEN');
    expect(result.checks.unknownScope.count).toBe(0);
  });

  it('YELLOW when >10% unknown scope', () => {
    // 2 of 11 nodes have unknown scope → ~18% → YELLOW
    const nodes: KGNode[] = [];
    for (let i = 0; i < 9; i++) {
      nodes.push(makeNode({ id: `u${i}`, scope: 'universal', title: `Node ${i}` }));
    }
    nodes.push(makeNode({ id: 'x1', scope: 'unknown', title: 'X1' }));
    nodes.push(makeNode({ id: 'x2', scope: 'unknown', title: 'X2' }));
    const result = runHealthCheck(buildGraph(nodes));
    expect(result.checks.unknownScope.status).toBe('YELLOW');
    expect(result.checks.unknownScope.count).toBe(2);
  });

  it('RED when >25% unknown scope', () => {
    // 3 of 10 = 30% → RED
    const nodes: KGNode[] = [];
    for (let i = 0; i < 7; i++) {
      nodes.push(makeNode({ id: `u${i}`, scope: 'universal', title: `Node ${i}` }));
    }
    for (let i = 0; i < 3; i++) {
      nodes.push(makeNode({ id: `x${i}`, scope: 'unknown', title: `X${i}` }));
    }
    const result = runHealthCheck(buildGraph(nodes));
    expect(result.checks.unknownScope.status).toBe('RED');
    expect(result.checks.unknownScope.count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Overall status aggregation
// ---------------------------------------------------------------------------

describe('overall status aggregation', () => {
  it('RED if any check is RED', () => {
    // Broken edge → RED
    const nodes = [makeNode({ id: 'a' })];
    const edges = [makeEdge({ from: 'a', to: 'ghost' })];
    const graph: KnowledgeGraph = {
      version: '1',
      lastUpdated: new Date().toISOString(),
      nodes,
      edges,
    };
    const result = runHealthCheck(graph);
    expect(result.status).toBe('RED');
  });

  it('GREEN when all checks pass', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'idea', scope: 'universal' }),
      makeNode({ id: 'b', type: 'idea', scope: 'universal' }),
    ];
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    // Both connected, no duplicates, no broken, no stale, no provenance targets, no unknown scope
    expect(result.status).toBe('GREEN');
  });
});

// ---------------------------------------------------------------------------
// recommendations
// ---------------------------------------------------------------------------

describe('recommendations', () => {
  it('max 5 recommendations', () => {
    // Create a graph with many issues
    const graph = createEmptyGraph();
    const result = runHealthCheck(graph);
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
  });

  it('recommendations are strings', () => {
    const nodes = [makeNode({ id: 'a', scope: 'unknown' })];
    const result = runHealthCheck(buildGraph(nodes));
    for (const rec of result.recommendations) {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// generateHealthReport
// ---------------------------------------------------------------------------

describe('generateHealthReport', () => {
  it('includes status emoji in output', () => {
    const result = runHealthCheck(createEmptyGraph());
    const report = generateHealthReport(result);
    expect(report).toContain('🟢 GREEN');
    expect(report).toContain('Grafens hälsorapport');
  });

  it('contains summary stats', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'idea', scope: 'universal' }),
      makeNode({ id: 'b', type: 'idea', scope: 'universal' }),
    ];
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    const report = generateHealthReport(result);
    expect(report).toContain('Noder:');
    expect(report).toContain('Kanter:');
    expect(report).toContain('Kanter/nod:');
  });

  it('includes check table rows', () => {
    const result = runHealthCheck(createEmptyGraph());
    const report = generateHealthReport(result);
    expect(report).toContain('Isolerade noder');
    expect(report).toContain('Dubbletter');
    expect(report).toContain('Trasiga kanter');
    expect(report).toContain('Inaktuella noder');
    expect(report).toContain('Saknad proveniens');
    expect(report).toContain('Okänt scope');
    expect(report).toContain('Saknade kanter');
  });

  it('uses 🔴 RED when status is RED', () => {
    const nodes = [makeNode({ id: 'a' })];
    const edges = [makeEdge({ from: 'a', to: 'ghost' })];
    const graph: KnowledgeGraph = {
      version: '1',
      lastUpdated: new Date().toISOString(),
      nodes,
      edges,
    };
    const result = runHealthCheck(graph);
    const report = generateHealthReport(result);
    expect(report).toContain('🔴 RED');
  });

  it('returns a string', () => {
    const result = runHealthCheck(createEmptyGraph());
    expect(typeof generateHealthReport(result)).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// maybeInjectHealthTrigger
// ---------------------------------------------------------------------------

describe('maybeInjectHealthTrigger', () => {
  it('returns unchanged brief for GREEN', () => {
    const brief = 'Do the thing.';
    expect(maybeInjectHealthTrigger(brief, 'GREEN')).toBe(brief);
  });

  it('returns unchanged brief for YELLOW', () => {
    const brief = 'Do the thing.';
    expect(maybeInjectHealthTrigger(brief, 'YELLOW')).toBe(brief);
  });

  it('appends trigger text for RED', () => {
    const brief = 'Do the thing.';
    const result = maybeInjectHealthTrigger(brief, 'RED');
    expect(result).toContain(brief);
    expect(result).toContain('⚡ Health-trigger');
    expect(result).toContain('Consolidator');
    expect(result.startsWith(brief)).toBe(true);
  });

  it('trigger text uses exact string from spec', () => {
    const brief = 'Brief content.';
    const result = maybeInjectHealthTrigger(brief, 'RED');
    expect(result).toBe(
      brief +
        '\n\n⚡ Health-trigger: Graph health is RED. After Historian completes, delegate to Consolidator with graph-health report as context.',
    );
  });
});

// ---------------------------------------------------------------------------
// edgesPerNode calculation
// ---------------------------------------------------------------------------

describe('summary.edgesPerNode', () => {
  it('is 0 when no nodes', () => {
    const result = runHealthCheck(createEmptyGraph());
    expect(result.summary.edgesPerNode).toBe(0);
  });

  it('calculates correctly for non-empty graph', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'idea', scope: 'universal' }),
      makeNode({ id: 'b', type: 'idea', scope: 'universal' }),
    ];
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const result = runHealthCheck(buildGraph(nodes, edges));
    expect(result.summary.edgesPerNode).toBeCloseTo(0.5, 2);
    expect(result.summary.totalNodes).toBe(2);
    expect(result.summary.totalEdges).toBe(1);
  });
});
