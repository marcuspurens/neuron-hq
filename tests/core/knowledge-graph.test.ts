import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyGraph,
  addNode,
  addEdge,
  findNodes,
  traverse,
  updateNode,
  removeNode,
  KGNodeSchema,
  KnowledgeGraphSchema,
  IdeaPropertiesSchema,
  computePriority,
  rankIdeas,
  linkRelatedIdeas,
  type KnowledgeGraph,
  type KGNode,
  type KGEdge,
} from '../../src/core/knowledge-graph.js';
import {
  migratePatterns,
  migrateErrors,
  migrateAll,
} from '../../src/core/knowledge-graph-migrate.js';

// --- Helpers ---

function makeNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'test-001',
    type: 'pattern',
    title: 'Test pattern',
    properties: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
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

// --- Tests ---

describe('Knowledge Graph — CRUD', () => {
  let graph: KnowledgeGraph;

  beforeEach(() => {
    graph = createEmptyGraph();
  });

  it('createEmptyGraph returns a valid empty graph', () => {
    const g = createEmptyGraph();
    expect(g.version).toBe('1.0.0');
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.lastUpdated).toBeTruthy();
    expect(() => KnowledgeGraphSchema.parse(g)).not.toThrow();
  });

  it('addNode adds a node and validates with Zod', () => {
    const node = makeNode({ id: 'p-001' });
    const result = addNode(graph, node);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('p-001');
    expect(() => KnowledgeGraphSchema.parse(result)).not.toThrow();
  });

  it('addNode rejects duplicate id', () => {
    const node = makeNode({ id: 'dup' });
    const g = addNode(graph, node);
    expect(() => addNode(g, makeNode({ id: 'dup' }))).toThrow(
      'Duplicate node id: dup',
    );
  });

  it('addNode rejects invalid node (missing title)', () => {
    expect(() =>
      addNode(graph, { ...makeNode(), title: '' } as KGNode),
    ).toThrow();
  });

  it('addEdge adds an edge between existing nodes', () => {
    let g = addNode(graph, makeNode({ id: 'a' }));
    g = addNode(g, makeNode({ id: 'b' }));
    const result = addEdge(g, makeEdge({ from: 'a', to: 'b' }));
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe('related_to');
  });

  it('addEdge rejects edge with non-existent from node', () => {
    const g = addNode(graph, makeNode({ id: 'b' }));
    expect(() =>
      addEdge(g, makeEdge({ from: 'missing', to: 'b' })),
    ).toThrow('Node not found: missing');
  });

  it('addEdge rejects edge with non-existent to node', () => {
    const g = addNode(graph, makeNode({ id: 'a' }));
    expect(() =>
      addEdge(g, makeEdge({ from: 'a', to: 'missing' })),
    ).toThrow('Node not found: missing');
  });

  it('findNodes filters by type', () => {
    let g = addNode(graph, makeNode({ id: 'p1', type: 'pattern' }));
    g = addNode(g, makeNode({ id: 'e1', type: 'error', title: 'An error' }));
    const patterns = findNodes(g, { type: 'pattern' });
    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe('p1');
  });

  it('findNodes filters by query string', () => {
    let g = addNode(
      graph,
      makeNode({ id: 'p1', title: 'Memory optimization' }),
    );
    g = addNode(g, makeNode({ id: 'p2', title: 'File handling' }));
    const results = findNodes(g, { query: 'memory' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('p1');
  });

  it('findNodes matches query in properties', () => {
    const g = addNode(
      graph,
      makeNode({
        id: 'p1',
        title: 'Something',
        properties: { context: 'overflow issue' },
      }),
    );
    const results = findNodes(g, { query: 'overflow' });
    expect(results).toHaveLength(1);
  });

  it('traverse follows edges from start node', () => {
    let g = addNode(graph, makeNode({ id: 'a', title: 'Node A' }));
    g = addNode(g, makeNode({ id: 'b', title: 'Node B' }));
    g = addNode(g, makeNode({ id: 'c', title: 'Node C' }));
    g = addEdge(g, makeEdge({ from: 'a', to: 'b', type: 'related_to' }));
    g = addEdge(g, makeEdge({ from: 'a', to: 'c', type: 'solves' }));
    const result = traverse(g, 'a');
    expect(result).toHaveLength(2);
    expect(result.map((n) => n.id).sort()).toEqual(['b', 'c']);
  });

  it('traverse follows edges bidirectionally', () => {
    let g = addNode(graph, makeNode({ id: 'a', title: 'Node A' }));
    g = addNode(g, makeNode({ id: 'b', title: 'Node B' }));
    g = addEdge(g, makeEdge({ from: 'b', to: 'a', type: 'related_to' }));
    // Starting from 'a', edge goes b→a, so a should find b
    const result = traverse(g, 'a');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('traverse respects depth limit', () => {
    let g = addNode(graph, makeNode({ id: 'a', title: 'A' }));
    g = addNode(g, makeNode({ id: 'b', title: 'B' }));
    g = addNode(g, makeNode({ id: 'c', title: 'C' }));
    g = addEdge(g, makeEdge({ from: 'a', to: 'b' }));
    g = addEdge(g, makeEdge({ from: 'b', to: 'c' }));
    // depth=1 should only get 'b'
    const depth1 = traverse(g, 'a', undefined, 1);
    expect(depth1).toHaveLength(1);
    expect(depth1[0].id).toBe('b');
    // depth=2 should get 'b' and 'c'
    const depth2 = traverse(g, 'a', undefined, 2);
    expect(depth2).toHaveLength(2);
  });

  it('traverse filters by edgeType', () => {
    let g = addNode(graph, makeNode({ id: 'a', title: 'A' }));
    g = addNode(g, makeNode({ id: 'b', title: 'B' }));
    g = addNode(g, makeNode({ id: 'c', title: 'C' }));
    g = addEdge(g, makeEdge({ from: 'a', to: 'b', type: 'solves' }));
    g = addEdge(g, makeEdge({ from: 'a', to: 'c', type: 'related_to' }));
    const result = traverse(g, 'a', 'solves');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('updateNode updates confidence and properties', () => {
    const g = addNode(graph, makeNode({ id: 'p1', confidence: 0.5 }));
    const updated = updateNode(g, 'p1', {
      confidence: 0.9,
      properties: { context: 'new context' },
    });
    expect(updated.nodes[0].confidence).toBe(0.9);
    expect(updated.nodes[0].properties).toEqual({ context: 'new context' });
  });

  it('updateNode throws for non-existent node', () => {
    expect(() => updateNode(graph, 'ghost', { confidence: 0.5 })).toThrow(
      'Node not found: ghost',
    );
  });

  it('removeNode removes node and connected edges', () => {
    let g = addNode(graph, makeNode({ id: 'a', title: 'A' }));
    g = addNode(g, makeNode({ id: 'b', title: 'B' }));
    g = addNode(g, makeNode({ id: 'c', title: 'C' }));
    g = addEdge(g, makeEdge({ from: 'a', to: 'b' }));
    g = addEdge(g, makeEdge({ from: 'b', to: 'c' }));
    g = addEdge(g, makeEdge({ from: 'c', to: 'a' }));
    const result = removeNode(g, 'a');
    expect(result.nodes).toHaveLength(2);
    // Only b→c should remain
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].from).toBe('b');
    expect(result.edges[0].to).toBe('c');
  });

  it('removeNode throws for non-existent node', () => {
    expect(() => removeNode(graph, 'ghost')).toThrow(
      'Node not found: ghost',
    );
  });
});

describe('Knowledge Graph — Zod validation', () => {
  it('KGNodeSchema rejects invalid confidence (>1)', () => {
    expect(() =>
      KGNodeSchema.parse({
        id: 'x',
        type: 'pattern',
        title: 'X',
        properties: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        confidence: 1.5,
      }),
    ).toThrow();
  });

  it('KGNodeSchema rejects unknown node type', () => {
    expect(() =>
      KGNodeSchema.parse({
        id: 'x',
        type: 'unknown_type',
        title: 'X',
        properties: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        confidence: 0.5,
      }),
    ).toThrow();
  });
});

// --- Migration tests ---

const SAMPLE_PATTERNS = `# Patterns — Mönster som fungerar

---

## Test pattern one
**Kontext:** Some context
**Lösning:** Some solution
**Effekt:** Good effect
**Keywords:** test, pattern
**Relaterat:** errors.md#Some error title
**Körningar:** #11
**Senast bekräftad:** 2026-01-01
**Bekräftelser:** 5

---

## Test pattern two
**Kontext:** Another context
**Lösning:** Another solution
**Effekt:** Another effect
**Keywords:** another, test
**Relaterat:** patterns.md#Test pattern one
**Körningar:** #42
**Senast bekräftad:** 2026-01-02
**Bekräftelser:** 0

---
`;

const SAMPLE_ERRORS = `# Errors — Misstag och lösningar

---

## Some error title
**Session:** 11
**Symptom:** Something broke
**Orsak:** Bad configuration
**Lösning:** Fixed the config
**Status:** Löst
**Körningar:** #11

---

## Another error
**Session:** 12
**Symptom:** Timeout issue
**Orsak:** Slow network
**Lösning:** Increase timeout
**Status:** Löst
**Bekräftelser:** 3

---
`;

describe('Knowledge Graph — Migration', () => {
  it('migratePatterns parses sample markdown and produces correct nodes', () => {
    const result = migratePatterns(SAMPLE_PATTERNS);
    const patternNodes = result.nodes.filter((n) => n.type === 'pattern');
    expect(patternNodes).toHaveLength(2);
    expect(patternNodes[0].id).toBe('pattern-001');
    expect(patternNodes[0].title).toBe('Test pattern one');
    expect(patternNodes[1].id).toBe('pattern-002');
    expect(patternNodes[1].title).toBe('Test pattern two');
  });

  it('migrateErrors parses sample markdown and produces correct nodes', () => {
    const result = migrateErrors(SAMPLE_ERRORS);
    const errorNodes = result.nodes.filter((n) => n.type === 'error');
    expect(errorNodes).toHaveLength(2);
    expect(errorNodes[0].id).toBe('error-001');
    expect(errorNodes[0].title).toBe('Some error title');
    expect(errorNodes[1].properties).toHaveProperty('symptom', 'Timeout issue');
    expect(errorNodes[1].properties).toHaveProperty('orsak', 'Slow network');
  });

  it('migratePatterns creates related_to edges from Relaterat field', () => {
    const result = migratePatterns(SAMPLE_PATTERNS);
    const relatedEdges = result.edges.filter((e) => e.type === 'related_to');
    // pattern-002 → pattern-001 (patterns.md#Test pattern one)
    const p2ToP1 = relatedEdges.find(
      (e) => e.from === 'pattern-002' && e.to === 'pattern-001',
    );
    expect(p2ToP1).toBeDefined();
    // pattern-001 → errors.md#Some error title should be skipped (no matching node in patterns)
    // since we only migrated patterns, error nodes don't exist
  });

  it('migratePatterns creates discovered_in edges from Körningar field', () => {
    const result = migratePatterns(SAMPLE_PATTERNS);
    const discoveredEdges = result.edges.filter(
      (e) => e.type === 'discovered_in',
    );
    expect(discoveredEdges.length).toBeGreaterThanOrEqual(2);
    // pattern-001 → run-011
    expect(
      discoveredEdges.find(
        (e) => e.from === 'pattern-001' && e.to === 'run-011',
      ),
    ).toBeDefined();
    // pattern-002 → run-042
    expect(
      discoveredEdges.find(
        (e) => e.from === 'pattern-002' && e.to === 'run-042',
      ),
    ).toBeDefined();
    // Run nodes should exist
    const runNodes = result.nodes.filter((n) => n.type === 'run');
    expect(runNodes).toHaveLength(2);
    expect(runNodes.map((n) => n.id).sort()).toEqual(['run-011', 'run-042']);
  });

  it('migratePatterns calculates confidence from Bekräftelser', () => {
    const result = migratePatterns(SAMPLE_PATTERNS);
    const patternNodes = result.nodes.filter((n) => n.type === 'pattern');
    // 5 confirmations → 0.85
    expect(patternNodes[0].confidence).toBe(0.85);
    // 0 confirmations → 0.5
    expect(patternNodes[1].confidence).toBe(0.5);
  });

  it('migratePatterns extracts properties correctly', () => {
    const result = migratePatterns(SAMPLE_PATTERNS);
    const p1 = result.nodes.find((n) => n.id === 'pattern-001');
    expect(p1?.properties).toMatchObject({
      kontext: 'Some context',
      lösning: 'Some solution',
      effekt: 'Good effect',
      keywords: ['test', 'pattern'],
    });
  });

  it('migratePatterns skips [UPPDATERING] and [OBSOLET] entries', () => {
    const md = `# Patterns

---

## Active pattern
**Kontext:** Active
**Bekräftelser:** 1

---

## Old pattern [OBSOLET]
**Kontext:** Should be skipped

---

## Updated pattern [UPPDATERING]
**Kontext:** Should be skipped too

---
`;
    const result = migratePatterns(md);
    const patternNodes = result.nodes.filter((n) => n.type === 'pattern');
    expect(patternNodes).toHaveLength(1);
    expect(patternNodes[0].title).toBe('Active pattern');
  });

  it('migrateErrors creates run nodes from Körningar', () => {
    const result = migrateErrors(SAMPLE_ERRORS);
    const runNodes = result.nodes.filter((n) => n.type === 'run');
    expect(runNodes).toHaveLength(1);
    expect(runNodes[0].id).toBe('run-011');
    expect(runNodes[0].confidence).toBe(1.0);
  });

  it('migrateErrors calculates confidence for errors', () => {
    const result = migrateErrors(SAMPLE_ERRORS);
    const errorNodes = result.nodes.filter((n) => n.type === 'error');
    // error-001 has no Bekräftelser → 0.5
    expect(errorNodes[0].confidence).toBe(0.5);
    // error-002 has Bekräftelser: 3 → 0.7
    expect(errorNodes[1].confidence).toBe(0.7);
  });

  it('handles Körningar with long run IDs', () => {
    const md = `# Patterns

---

## Long run ref pattern
**Kontext:** Test
**Körningar:** #20260222-1757-aurora-swarm-lab

---
`;
    const result = migratePatterns(md);
    const runNodes = result.nodes.filter((n) => n.type === 'run');
    expect(runNodes).toHaveLength(1);
    expect(runNodes[0].id).toBe('run-20260222-1757-aurora-swarm-lab');
  });

  it('handles empty Relaterat field gracefully', () => {
    const md = `# Patterns

---

## No relations
**Kontext:** Test
**Relaterat:** —

---
`;
    const result = migratePatterns(md);
    const relatedEdges = result.edges.filter((e) => e.type === 'related_to');
    expect(relatedEdges).toHaveLength(0);
  });
});

describe('Knowledge Graph — migrateAll (cross-file)', () => {
  it('resolves cross-file Relaterat references between patterns and errors', () => {
    const result = migrateAll(SAMPLE_PATTERNS, SAMPLE_ERRORS);

    const patternNodes = result.nodes.filter((n) => n.type === 'pattern');
    const errorNodes = result.nodes.filter((n) => n.type === 'error');
    expect(patternNodes).toHaveLength(2);
    expect(errorNodes).toHaveLength(2);

    // pattern-001 references errors.md#Some error title → should resolve to error-001
    const crossEdge = result.edges.find(
      (e) =>
        e.from === 'pattern-001' &&
        e.to === 'error-001' &&
        e.type === 'related_to',
    );
    expect(crossEdge).toBeDefined();
  });

  it('deduplicates run nodes across both files', () => {
    // Both files reference run #11
    const result = migrateAll(SAMPLE_PATTERNS, SAMPLE_ERRORS);
    const runNodes = result.nodes.filter((n) => n.type === 'run');
    const run011 = runNodes.filter((n) => n.id === 'run-011');
    expect(run011).toHaveLength(1); // Only one instance despite both files referencing it
  });

  it('keeps discovered_in edges from both files', () => {
    const result = migrateAll(SAMPLE_PATTERNS, SAMPLE_ERRORS);
    const discoveredEdges = result.edges.filter(
      (e) => e.type === 'discovered_in',
    );
    // pattern-001 → run-011, pattern-002 → run-042, error-001 → run-011
    expect(discoveredEdges.length).toBeGreaterThanOrEqual(3);
  });

  it('total nodes include patterns + errors + runs', () => {
    const result = migrateAll(SAMPLE_PATTERNS, SAMPLE_ERRORS);
    // 2 patterns + 2 errors + 2 unique runs (011, 042)
    expect(result.nodes.length).toBe(6);
  });

  it('handles empty errors markdown', () => {
    const result = migrateAll(SAMPLE_PATTERNS, '');
    const patternNodes = result.nodes.filter((n) => n.type === 'pattern');
    expect(patternNodes).toHaveLength(2);
    const errorNodes = result.nodes.filter((n) => n.type === 'error');
    expect(errorNodes).toHaveLength(0);
  });
});

describe('KGNode model field', () => {
  it('validates node with model field', () => {
    const node = makeNode({ model: 'claude-opus-4-6' });
    expect(KGNodeSchema.parse(node).model).toBe('claude-opus-4-6');
  });

  it('validates node without model field (optional)', () => {
    const node = makeNode();
    const parsed = KGNodeSchema.parse(node);
    expect(parsed.model).toBeUndefined();
  });

  it('validates node with empty string model', () => {
    const node = makeNode({ model: '' });
    const parsed = KGNodeSchema.parse(node);
    expect(parsed.model).toBe('');
  });
});

describe('IdeaPropertiesSchema', () => {
  it('validates complete idea properties', () => {
    const valid = { description: 'test', impact: 4, effort: 2, risk: 3 };
    expect(() => IdeaPropertiesSchema.parse(valid)).not.toThrow();
  });

  it('rejects impact outside 1-5', () => {
    expect(() => IdeaPropertiesSchema.parse({ description: 'x', impact: 0, effort: 3, risk: 3 })).toThrow();
    expect(() => IdeaPropertiesSchema.parse({ description: 'x', impact: 6, effort: 3, risk: 3 })).toThrow();
  });

  it('applies defaults for risk, status, tags', () => {
    const result = IdeaPropertiesSchema.parse({ description: 'x', impact: 3, effort: 3 });
    expect(result.risk).toBe(3);
    expect(result.status).toBe('proposed');
    expect(result.tags).toEqual([]);
  });
});

describe('computePriority', () => {
  it('computes max priority (5, 1, 1)', () => {
    expect(computePriority(5, 1, 1)).toBe(5.0);
  });

  it('computes min priority (1, 5, 5)', () => {
    expect(computePriority(1, 5, 5)).toBe(0.04);
  });

  it('computes default priority (3, 3, 3)', () => {
    expect(computePriority(3, 3, 3)).toBe(1.08);
  });
});

describe('rankIdeas', () => {
  function makeIdeaNode(id: string, props: Record<string, unknown>): KGNode {
    return {
      id, type: 'idea', title: `Idea ${id}`,
      properties: { description: 'test', status: 'proposed', ...props },
      confidence: 0.5, scope: 'project-specific', model: null,
      created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
    };
  }

  const testGraph: KnowledgeGraph = {
    version: '1.0',
    nodes: [
      makeIdeaNode('idea-001', { impact: 5, effort: 1, risk: 1, priority: 5.0, group: 'logger' }),
      makeIdeaNode('idea-002', { impact: 3, effort: 3, risk: 3, priority: 1.08, group: 'logger' }),
      makeIdeaNode('idea-003', { impact: 1, effort: 5, risk: 5, priority: 0.04, group: 'security' }),
      makeIdeaNode('idea-004', { impact: 4, effort: 2, risk: 2, priority: 2.56, status: 'done' }),
      makeIdeaNode('idea-005', { impact: 4, effort: 2, risk: 1, priority: 3.2, group: 'logger' }),
    ],
    edges: [
      { from: 'idea-001', to: 'idea-002', type: 'related_to', metadata: {} },
      { from: 'idea-001', to: 'idea-005', type: 'related_to', metadata: {} },
      { from: 'idea-001', to: 'run-001', type: 'discovered_in', metadata: {} },
    ],
    lastUpdated: '2026-01-01T00:00:00Z',
  };

  it('returns ideas sorted by priority (highest first)', () => {
    const ranked = rankIdeas(testGraph);
    expect(ranked[0].id).toBe('idea-001');
    expect(ranked[ranked.length - 1].id).toBe('idea-003');
  });

  it('filters by status (default: proposed + accepted)', () => {
    const ranked = rankIdeas(testGraph);
    expect(ranked.find(n => n.id === 'idea-004')).toBeUndefined(); // status: done
  });

  it('filters by group', () => {
    const ranked = rankIdeas(testGraph, { group: 'security', status: ['proposed'] });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('idea-003');
  });

  it('filters by minImpact', () => {
    const ranked = rankIdeas(testGraph, { minImpact: 4, status: ['proposed', 'done'] });
    expect(ranked.every(n => (n.properties.impact as number) >= 4)).toBe(true);
  });

  it('respects limit', () => {
    const ranked = rankIdeas(testGraph, { limit: 2 });
    expect(ranked).toHaveLength(2);
  });

  it('applies connection boost (idea-001 has 3 edges)', () => {
    const withBoost = rankIdeas(testGraph, { boostConnected: true, status: ['proposed'] });
    const withoutBoost = rankIdeas(testGraph, { boostConnected: false, status: ['proposed'] });
    // idea-001 should be first in both (already highest priority), but its effective score should be higher with boost
    expect(withBoost[0].id).toBe('idea-001');
    expect(withoutBoost[0].id).toBe('idea-001');
  });

  it('ideas without impact/effort rank last', () => {
    const graphWithEmpty = {
      ...testGraph,
      nodes: [
        ...testGraph.nodes,
        makeIdeaNode('idea-006', {}), // no impact/effort
      ],
    };
    const ranked = rankIdeas(graphWithEmpty);
    expect(ranked[ranked.length - 1].id).toBe('idea-006');
  });

  it('computes priority if missing', () => {
    const graphNoPriority = {
      ...testGraph,
      nodes: [
        makeIdeaNode('idea-010', { impact: 5, effort: 1, risk: 1 }), // no priority field
      ],
      edges: [],
    };
    const ranked = rankIdeas(graphNoPriority);
    expect(ranked).toHaveLength(1); // should still appear
  });

  it('returns empty array for graph with no ideas', () => {
    const emptyGraph = { version: '1.0', nodes: [], edges: [], lastUpdated: '' };
    expect(rankIdeas(emptyGraph)).toEqual([]);
  });
});


describe('linkRelatedIdeas', () => {
  function makeIdeaNode(id: string, title: string, description: string): KGNode {
    return {
      id, type: 'idea', title,
      properties: { description, impact: 3, effort: 3, risk: 3, status: 'proposed' },
      confidence: 0.5, scope: 'project-specific', model: null,
      created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
    };
  }

  it('links ideas with similar text', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'Log writer batching output', 'Batch log writer output entries for production'),
        makeIdeaNode('idea-002', 'Log writer streaming output', 'Stream log writer output entries to Langfuse'),
        makeIdeaNode('idea-003', 'Database sharding strategy', 'Implement database sharding for horizontal scale'),
      ],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const result = linkRelatedIdeas(graph, { similarityThreshold: 0.15 });
    // idea-001 and idea-002 share log, writer, output, entries
    const newEdges = result.edges.filter(e => e.type === 'related_to');
    expect(newEdges.length).toBeGreaterThan(0);
    // At least the log writer pair should be linked
    const logWriterEdge = newEdges.find(e =>
      (e.from === 'idea-001' && e.to === 'idea-002') ||
      (e.from === 'idea-002' && e.to === 'idea-001')
    );
    expect(logWriterEdge).toBeDefined();
  });

  it('respects similarity threshold', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'Apple pie recipe', 'Best apple pie recipe ever'),
        makeIdeaNode('idea-002', 'Quantum physics', 'Advanced quantum physics research'),
      ],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const result = linkRelatedIdeas(graph, { similarityThreshold: 0.5 });
    expect(result.edges).toHaveLength(0);
  });

  it('respects maxEdgesPerNode', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'Log writer batching', 'Batch log writer entries'),
        makeIdeaNode('idea-002', 'Log writer file', 'File-based log writer'),
        makeIdeaNode('idea-003', 'Log writer network', 'Network log writer'),
        makeIdeaNode('idea-004', 'Log writer rotation', 'Log writer rotation support'),
      ],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const result = linkRelatedIdeas(graph, { maxEdgesPerNode: 1, similarityThreshold: 0.1 });
    // Each node should have at most 1 related_to edge
    for (const node of result.nodes.filter(n => n.type === 'idea')) {
      const count = result.edges.filter(e =>
        e.type === 'related_to' && (e.from === node.id || e.to === node.id)
      ).length;
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it('does not duplicate existing edges', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'Log writer batching', 'Batch log entries'),
        makeIdeaNode('idea-002', 'Log writer file', 'File-based log writer'),
      ],
      edges: [
        { from: 'idea-001', to: 'idea-002', type: 'related_to', metadata: {} },
      ],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const result = linkRelatedIdeas(graph, { similarityThreshold: 0.1 });
    const relatedEdges = result.edges.filter(e => e.type === 'related_to');
    expect(relatedEdges).toHaveLength(1); // no new edge added
  });

  it('only creates idea-to-idea edges (not idea to pattern)', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [
        makeIdeaNode('idea-001', 'Log writer batching', 'Batch log entries'),
        { id: 'pattern-001', type: 'pattern', title: 'Log writer batching pattern',
          properties: { description: 'Batch log entries pattern' },
          confidence: 0.9, scope: 'universal', model: null,
          created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z' },
      ],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const result = linkRelatedIdeas(graph, { similarityThreshold: 0.1 });
    // Should not create any edges since there is only 1 idea node
    expect(result.edges).toHaveLength(0);
  });

  it('handles graph with fewer than 2 ideas', () => {
    const graph: KnowledgeGraph = {
      version: '1.0',
      nodes: [makeIdeaNode('idea-001', 'Only idea', 'Single idea')],
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
    const result = linkRelatedIdeas(graph);
    expect(result.edges).toHaveLength(0);
  });
});
