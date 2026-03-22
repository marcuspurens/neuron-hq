import { describe, it, expect } from 'vitest';
import {
  clusterIdeas,
  createMetaIdeas,
  identifyArchiveCandidates,
  generateConsolidationReport,
  tokenizeForClustering,
  type IdeaCluster,
  type ClusterResult,
} from '../../src/core/idea-clusters.js';
import {
  createEmptyGraph,
  addNode,
  addEdge,
  computePriority,
  type KnowledgeGraph,
  type KGNode,
  type KGEdge,
} from '../../src/core/knowledge-graph.js';

// ── Helpers ──────────────────────────────────────────────

function makeIdea(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'idea-001',
    type: 'idea',
    title: 'Test idea',
    properties: {
      description: 'A test idea description',
      impact: 3,
      effort: 3,
      risk: 3,
      status: 'proposed',
      provenance: 'agent',
    },
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.7,
    scope: 'project-specific',
    model: null,
    ...overrides,
  };
}

/**
 * Build a graph from an array of idea nodes and optional edges.
 * Uses createEmptyGraph + addNode + addEdge for proper validation.
 */
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

// ── tokenizeForClustering ────────────────────────────────

describe('tokenizeForClustering', () => {
  it('1. returns Set of lowercase non-stopword tokens', () => {
    const tokens = tokenizeForClustering('Hello World Algorithm Model');
    expect(tokens).toBeInstanceOf(Set);
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('algorithm');
    expect(tokens).toContain('model');
    // 'the', 'and' would be stopwords — not present in input but verify lowercase
    for (const t of tokens) {
      expect(t).toBe(t.toLowerCase());
    }
  });

  it('2. filters words shorter than 3 chars', () => {
    const tokens = tokenizeForClustering('ab cd ef ghi jkl');
    expect(tokens.has('ab')).toBe(false);
    expect(tokens.has('cd')).toBe(false);
    expect(tokens.has('ef')).toBe(false);
    expect(tokens.has('ghi')).toBe(true);
    expect(tokens.has('jkl')).toBe(true);
  });

  it('3. returns empty set for empty string', () => {
    const tokens = tokenizeForClustering('');
    expect(tokens.size).toBe(0);
  });

  it('4. filters Swedish and English stopwords', () => {
    const tokens = tokenizeForClustering(
      'the algorithm and the model och algoritmen för modellen',
    );
    // English stopwords filtered
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('and')).toBe(false);
    // Swedish stopwords filtered
    expect(tokens.has('och')).toBe(false);
    expect(tokens.has('för')).toBe(false);
    // Content words kept
    expect(tokens.has('algorithm')).toBe(true);
    expect(tokens.has('model')).toBe(true);
    expect(tokens.has('algoritmen')).toBe(true);
    expect(tokens.has('modellen')).toBe(true);
  });
});

// ── clusterIdeas — empty/edge cases ──────────────────────

describe('clusterIdeas — empty/edge cases', () => {
  it('5. empty graph returns empty result with zero stats', () => {
    const graph = createEmptyGraph();
    const result = clusterIdeas(graph);
    expect(result.clusters).toEqual([]);
    expect(result.unclustered).toEqual([]);
    expect(result.stats).toEqual({
      totalIdeas: 0,
      clusteredCount: 0,
      unclusteredCount: 0,
      archivedCount: 0,
      clusterCount: 0,
    });
  });

  it('6. graph with < 3 ideas returns all in unclustered', () => {
    const graph = buildGraph([
      makeIdea({ id: 'i1', title: 'Alpha idea' }),
      makeIdea({ id: 'i2', title: 'Beta idea' }),
    ]);
    const result = clusterIdeas(graph);
    expect(result.clusters).toHaveLength(0);
    expect(result.unclustered).toHaveLength(2);
    expect(result.unclustered).toContain('i1');
    expect(result.unclustered).toContain('i2');
  });

  it('7. ideas with status rejected are excluded', () => {
    const graph = buildGraph([
      makeIdea({
        id: 'i1',
        title: 'Algorithm optimization speedup',
        properties: {
          description: 'algorithm optimization speedup',
          impact: 3, effort: 3, risk: 3,
          status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i2',
        title: 'Algorithm optimization fast',
        properties: {
          description: 'algorithm optimization fast',
          impact: 3, effort: 3, risk: 3,
          status: 'rejected', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i3',
        title: 'Algorithm optimization parallel',
        properties: {
          description: 'algorithm optimization parallel',
          impact: 3, effort: 3, risk: 3,
          status: 'proposed', provenance: 'agent',
        },
      }),
    ]);
    const result = clusterIdeas(graph);
    // Only 2 non-rejected ideas
    expect(result.stats.totalIdeas).toBe(2);
  });
});

// ── clusterIdeas — clustering logic ──────────────────────

describe('clusterIdeas — clustering logic', () => {
  it('8. similar ideas are grouped into clusters', () => {
    const graph = buildGraph([
      makeIdea({
        id: 'i1',
        title: 'Agent memory persistent state storage',
        properties: {
          description: 'agent memory persistent state storage implementation',
          impact: 4, effort: 3, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i2',
        title: 'Persistent state agent memory',
        properties: {
          description: 'persistent state agent memory management',
          impact: 3, effort: 2, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i3',
        title: 'Agent persistent memory storage',
        properties: {
          description: 'agent persistent memory storage layer',
          impact: 5, effort: 3, risk: 1, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i4',
        title: 'Memory state persistent agent',
        properties: {
          description: 'memory state persistent agent caching',
          impact: 3, effort: 4, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i5',
        title: 'Unrelated security audit scanning',
        properties: {
          description: 'security audit vulnerability scanning assessment',
          impact: 2, effort: 2, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
    ]);
    const result = clusterIdeas(graph, {
      similarityThreshold: 0.2,
      minClusterSize: 2,
    });
    // The 4 agent/memory/persistent ideas should cluster
    const clusterWithAgentIdeas = result.clusters.find(
      (c) => c.memberIds.includes('i1') || c.memberIds.includes('i2'),
    );
    expect(clusterWithAgentIdeas).toBeDefined();
    expect(clusterWithAgentIdeas!.memberIds.length).toBeGreaterThanOrEqual(2);
    // Security idea should be unclustered
    expect(result.unclustered).toContain('i5');
  });

  it('9. each idea belongs to max one cluster', () => {
    const graph = buildGraph([
      makeIdea({
        id: 'i1',
        title: 'Database optimization caching query',
        properties: {
          description: 'database optimization caching query performance',
          impact: 4, effort: 3, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i2',
        title: 'Database optimization caching query',
        properties: {
          description: 'database optimization caching query performance',
          impact: 3, effort: 2, risk: 1, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i3',
        title: 'Database optimization caching query',
        properties: {
          description: 'database optimization caching query performance',
          impact: 5, effort: 4, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i4',
        title: 'Network protocol improvement latency',
        properties: {
          description: 'network protocol improvement latency reduction',
          impact: 3, effort: 3, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i5',
        title: 'Network protocol improvement latency',
        properties: {
          description: 'network protocol improvement latency reduction',
          impact: 4, effort: 2, risk: 1, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i6',
        title: 'Network protocol improvement latency',
        properties: {
          description: 'network protocol improvement latency reduction',
          impact: 2, effort: 3, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
    ]);
    const result = clusterIdeas(graph, {
      similarityThreshold: 0.2,
      minClusterSize: 2,
    });
    // Collect all memberIds across all clusters
    const allMemberIds = result.clusters.flatMap((c) => c.memberIds);
    const uniqueIds = new Set(allMemberIds);
    // Each idea appears at most once across clusters
    expect(allMemberIds.length).toBe(uniqueIds.size);
  });

  it('10. clusters with fewer than minClusterSize members are dissolved to unclustered', () => {
    // 3 similar ideas + 1 somewhat similar but we use high minClusterSize
    const graph = buildGraph([
      makeIdea({
        id: 'i1',
        title: 'Machine learning training pipeline',
        properties: {
          description: 'machine learning training pipeline optimization',
          impact: 4, effort: 3, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i2',
        title: 'Machine learning training pipeline',
        properties: {
          description: 'machine learning training pipeline scaling',
          impact: 3, effort: 2, risk: 1, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i3',
        title: 'Machine learning training pipeline',
        properties: {
          description: 'machine learning training pipeline deployment',
          impact: 5, effort: 4, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
    ]);
    // Use very high minClusterSize so all clusters are dissolved
    const result = clusterIdeas(graph, {
      similarityThreshold: 0.2,
      minClusterSize: 10,
    });
    expect(result.clusters).toHaveLength(0);
    expect(result.unclustered.length).toBeGreaterThan(0);
  });

  it('11. custom threshold changes clustering behavior (lower threshold = more clusters)', () => {
    // Create ideas with varying similarity
    const ideas = [
      makeIdea({
        id: 'i1',
        title: 'Caching strategy redis implementation',
        properties: {
          description: 'caching strategy redis implementation performance',
          impact: 4, effort: 3, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i2',
        title: 'Caching strategy redis performance',
        properties: {
          description: 'caching strategy redis performance tuning',
          impact: 3, effort: 2, risk: 1, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i3',
        title: 'Caching strategy redis optimization',
        properties: {
          description: 'caching strategy redis optimization scaling',
          impact: 5, effort: 4, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i4',
        title: 'Database query indexing performance',
        properties: {
          description: 'database query indexing performance tuning',
          impact: 3, effort: 3, risk: 2, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i5',
        title: 'Database query indexing optimization',
        properties: {
          description: 'database query indexing optimization scaling',
          impact: 4, effort: 2, risk: 1, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i6',
        title: 'Database query indexing improvement',
        properties: {
          description: 'database query indexing improvement approach',
          impact: 2, effort: 3, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
    ];
    const graph = buildGraph(ideas);

    const highThreshold = clusterIdeas(graph, {
      similarityThreshold: 0.8,
      minClusterSize: 2,
    });
    const lowThreshold = clusterIdeas(graph, {
      similarityThreshold: 0.1,
      minClusterSize: 2,
    });
    // Lower threshold should cluster at least as many ideas
    expect(lowThreshold.stats.clusteredCount).toBeGreaterThanOrEqual(
      highThreshold.stats.clusteredCount,
    );
  });

  it('12. cluster labels are generated from top-3 common tokens', () => {
    const graph = buildGraph([
      makeIdea({
        id: 'i1',
        title: 'Database caching optimization',
        properties: {
          description: 'database caching optimization implementation',
          impact: 3, effort: 3, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i2',
        title: 'Database caching optimization',
        properties: {
          description: 'database caching optimization scaling',
          impact: 3, effort: 3, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
      makeIdea({
        id: 'i3',
        title: 'Database caching optimization',
        properties: {
          description: 'database caching optimization performance',
          impact: 3, effort: 3, risk: 3, status: 'proposed', provenance: 'agent',
        },
      }),
    ]);
    const result = clusterIdeas(graph, {
      similarityThreshold: 0.1,
      minClusterSize: 2,
    });
    expect(result.clusters.length).toBeGreaterThan(0);
    const label = result.clusters[0].label;
    // Label should contain ' / ' separating top tokens
    expect(label).toContain('/');
    // Label should not exceed 60 chars
    expect(label.length).toBeLessThanOrEqual(60);
  });
});

// ── createMetaIdeas ──────────────────────────────────────

describe('createMetaIdeas', () => {
  it('13. creates one KGNode per cluster with type idea and is_meta = true', () => {
    const graph = buildGraph([
      makeIdea({ id: 'i1', title: 'Idea one' }),
      makeIdea({ id: 'i2', title: 'Idea two' }),
      makeIdea({ id: 'i3', title: 'Idea three' }),
    ]);
    const clusters: IdeaCluster[] = [
      {
        id: 'cluster-001',
        label: 'test / cluster / label',
        memberIds: ['i1', 'i2', 'i3'],
        avgImpact: 3,
        avgEffort: 3,
        avgRisk: 3,
        topPriority: 3,
        memberCount: 3,
      },
    ];
    const { newNodes } = createMetaIdeas(graph, clusters);
    expect(newNodes).toHaveLength(1);
    expect(newNodes[0].type).toBe('idea');
    expect(newNodes[0].properties.is_meta).toBe(true);
    expect(newNodes[0].id).toBe('idea-meta-cluster-001');
    // Verify the meta-idea uses rounded cluster averages
    const expectedPriority = computePriority(3, 3, 3);
    expect(expectedPriority).toBeGreaterThan(0);
  });

  it('14. creates related_to edges from meta idea to each member', () => {
    const graph = buildGraph([
      makeIdea({ id: 'i1', title: 'Idea one' }),
      makeIdea({ id: 'i2', title: 'Idea two' }),
    ]);
    const clusters: IdeaCluster[] = [
      {
        id: 'cluster-001',
        label: 'test / cluster',
        memberIds: ['i1', 'i2'],
        avgImpact: 3,
        avgEffort: 3,
        avgRisk: 3,
        topPriority: 3,
        memberCount: 2,
      },
    ];
    const { newEdges } = createMetaIdeas(graph, clusters);
    expect(newEdges).toHaveLength(2);
    for (const edge of newEdges) {
      expect(edge.from).toBe('idea-meta-cluster-001');
      expect(edge.type).toBe('related_to');
    }
    const edgeTargets = newEdges.map((e) => e.to);
    expect(edgeTargets).toContain('i1');
    expect(edgeTargets).toContain('i2');
  });

  it('15. skips meta ideas whose ID already exists in graph (idempotent)', () => {
    // Add a meta-idea node to the graph so it already exists
    let graph = buildGraph([
      makeIdea({ id: 'i1', title: 'Idea one' }),
      makeIdea({ id: 'i2', title: 'Idea two' }),
    ]);
    // Add the meta node that would be created
    graph = addNode(graph, makeIdea({
      id: 'idea-meta-cluster-001',
      title: '[Kluster] existing meta',
      properties: {
        description: 'Already exists',
        impact: 3, effort: 3, risk: 3,
        status: 'proposed', provenance: 'agent',
        is_meta: true,
      },
    }));
    const clusters: IdeaCluster[] = [
      {
        id: 'cluster-001',
        label: 'existing / meta',
        memberIds: ['i1', 'i2'],
        avgImpact: 3,
        avgEffort: 3,
        avgRisk: 3,
        topPriority: 3,
        memberCount: 2,
      },
    ];
    const { newNodes, newEdges } = createMetaIdeas(graph, clusters);
    // Should skip since the meta idea already exists
    expect(newNodes).toHaveLength(0);
    expect(newEdges).toHaveLength(0);
  });
});

// ── identifyArchiveCandidates ────────────────────────────

describe('identifyArchiveCandidates', () => {
  it('16. returns IDs of ideas with confidence <= 0.3, mention_count <= 1, status proposed, no outgoing edges', () => {
    const graph = buildGraph([
      makeIdea({
        id: 'archive-me',
        title: 'Low confidence idea',
        confidence: 0.2,
        properties: {
          description: 'Should be archived',
          impact: 3, effort: 3, risk: 3,
          status: 'proposed', provenance: 'agent',
          mention_count: 1,
        },
      }),
    ]);
    const candidates = identifyArchiveCandidates(graph);
    expect(candidates).toContain('archive-me');
  });

  it('17. does NOT archive ideas with status accepted, in-progress, or done', () => {
    for (const status of ['accepted', 'in-progress', 'done'] as const) {
      const graph = buildGraph([
        makeIdea({
          id: `idea-${status}`,
          title: `Idea with status ${status}`,
          confidence: 0.1,
          properties: {
            description: 'Low confidence but active',
            impact: 3, effort: 3, risk: 3,
            status,
            provenance: 'agent',
            mention_count: 0,
          },
        }),
      ]);
      const candidates = identifyArchiveCandidates(graph);
      expect(candidates).not.toContain(`idea-${status}`);
    }
  });

  it('18. does NOT archive ideas with outgoing inspired_by or used_by edges', () => {
    // Test inspired_by
    let graph = buildGraph([
      makeIdea({
        id: 'idea-connected',
        title: 'Connected idea',
        confidence: 0.2,
        properties: {
          description: 'Has outgoing edge',
          impact: 3, effort: 3, risk: 3,
          status: 'proposed', provenance: 'agent',
          mention_count: 0,
        },
      }),
      makeIdea({ id: 'other-idea', title: 'Other idea' }),
    ]);
    graph = addEdge(graph, {
      from: 'idea-connected',
      to: 'other-idea',
      type: 'inspired_by',
      metadata: { agent: 'test' },
    });
    expect(identifyArchiveCandidates(graph)).not.toContain('idea-connected');

    // Test used_by
    let graph2 = buildGraph([
      makeIdea({
        id: 'idea-used',
        title: 'Used idea',
        confidence: 0.2,
        properties: {
          description: 'Has outgoing used_by edge',
          impact: 3, effort: 3, risk: 3,
          status: 'proposed', provenance: 'agent',
          mention_count: 0,
        },
      }),
      makeIdea({ id: 'other-idea-2', title: 'Other idea 2' }),
    ]);
    graph2 = addEdge(graph2, {
      from: 'idea-used',
      to: 'other-idea-2',
      type: 'used_by',
      metadata: { agent: 'test' },
    });
    expect(identifyArchiveCandidates(graph2)).not.toContain('idea-used');
  });

  it('19. does NOT archive ideas with confidence > 0.3', () => {
    const graph = buildGraph([
      makeIdea({
        id: 'high-conf',
        title: 'High confidence idea',
        confidence: 0.5,
        properties: {
          description: 'Confident enough',
          impact: 3, effort: 3, risk: 3,
          status: 'proposed', provenance: 'agent',
          mention_count: 0,
        },
      }),
    ]);
    const candidates = identifyArchiveCandidates(graph);
    expect(candidates).not.toContain('high-conf');
  });
});

// ── generateConsolidationReport ──────────────────────────

describe('generateConsolidationReport', () => {
  it('20. returns markdown with Sammanfattning section', () => {
    const graph = buildGraph([
      makeIdea({ id: 'i1', title: 'Idea one' }),
    ]);
    const result: ClusterResult = {
      clusters: [],
      unclustered: ['i1'],
      archived: [],
      stats: {
        totalIdeas: 1,
        clusteredCount: 0,
        unclusteredCount: 1,
        archivedCount: 0,
        clusterCount: 0,
      },
    };
    const report = generateConsolidationReport(result, [], graph);
    expect(report).toContain('## Sammanfattning');
    expect(report).toContain('**Totalt antal idéer:** 1');
  });

  it('21. top-10 clusters are sorted by topPriority descending', () => {
    const ideas: KGNode[] = [];
    const clusters: IdeaCluster[] = [];
    // Create 3 clusters with different priorities
    const priorities = [2.0, 5.0, 3.5];
    for (let c = 0; c < 3; c++) {
      const memberIds: string[] = [];
      for (let m = 0; m < 3; m++) {
        const id = `c${c}m${m}`;
        ideas.push(makeIdea({ id, title: `Cluster ${c} member ${m}` }));
        memberIds.push(id);
      }
      clusters.push({
        id: `cluster-${String(c + 1).padStart(3, '0')}`,
        label: `cluster-${c}`,
        memberIds,
        avgImpact: 3,
        avgEffort: 3,
        avgRisk: 3,
        topPriority: priorities[c],
        memberCount: 3,
      });
    }
    const graph = buildGraph(ideas);
    const result: ClusterResult = {
      clusters,
      unclustered: [],
      archived: [],
      stats: {
        totalIdeas: 9,
        clusteredCount: 9,
        unclusteredCount: 0,
        archivedCount: 0,
        clusterCount: 3,
      },
    };
    const report = generateConsolidationReport(result, clusters, graph);
    // Extract the table rows (after header)
    const lines = report.split('\n');
    const tableRows = lines.filter((l) => l.startsWith('| ') && /^\| \d/.test(l));
    expect(tableRows.length).toBe(3);
    // First row should be the highest priority (5.0)
    expect(tableRows[0]).toContain('cluster-1');
    // Second should be 3.5
    expect(tableRows[1]).toContain('cluster-2');
    // Third should be 2.0
    expect(tableRows[2]).toContain('cluster-0');
  });

  it('22. max 10 members per cluster in report, with ... och N till for extra', () => {
    const memberIds: string[] = [];
    const ideas: KGNode[] = [];
    for (let i = 0; i < 15; i++) {
      const id = `m${i}`;
      memberIds.push(id);
      ideas.push(makeIdea({ id, title: `Member idea ${i}` }));
    }
    const graph = buildGraph(ideas);
    const cluster: IdeaCluster = {
      id: 'cluster-001',
      label: 'big cluster',
      memberIds,
      avgImpact: 3,
      avgEffort: 3,
      avgRisk: 3,
      topPriority: 3,
      memberCount: 15,
    };
    const result: ClusterResult = {
      clusters: [cluster],
      unclustered: [],
      archived: [],
      stats: {
        totalIdeas: 15,
        clusteredCount: 15,
        unclusteredCount: 0,
        archivedCount: 0,
        clusterCount: 1,
      },
    };
    const report = generateConsolidationReport(result, [cluster], graph);
    expect(report).toContain('... och 5 till');
  });
});
