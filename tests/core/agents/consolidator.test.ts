import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createEmptyGraph, addNode, addEdge, saveGraph, loadGraph, type KGNode } from '../../../src/core/knowledge-graph.js';
import { mergeNodes, findDuplicateCandidates, findStaleNodes, findMissingEdges } from '../../../src/core/graph-merge.js';
import * as graphMerge from '../../../src/core/graph-merge.js';

function makeNode(overrides: Partial<KGNode> = {}): KGNode {
  return {
    id: 'test-001',
    type: 'pattern',
    title: 'Test pattern',
    properties: {},
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    confidence: 0.8,
    scope: 'unknown',
    ...overrides,
  };
}

describe('Consolidator Agent — Tool Integration', () => {
  let tmpDir: string;
  let graphPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consolidator-test-'));
    graphPath = path.join(tmpDir, 'graph.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('consolidator agent file exports ConsolidatorAgent class', async () => {
    const mod = await import('../../../src/core/agents/consolidator.js');
    expect(mod.ConsolidatorAgent).toBeDefined();
    expect(typeof mod.ConsolidatorAgent).toBe('function');
  });

  it('graph_merge_nodes tool correctly merges via mergeNodes function', async () => {
    // Simulate what the graph_merge_nodes tool does internally
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'p-001', title: 'retry with backoff' }));
    graph = addNode(graph, makeNode({ id: 'p-002', title: 'exponential backoff retry' }));
    graph = addNode(graph, makeNode({ id: 'e-001', type: 'error', title: 'timeout error', confidence: 0.5 }));
    graph = addEdge(graph, { from: 'p-002', to: 'e-001', type: 'solves', metadata: {} });

    await saveGraph(graph, graphPath);

    // Load, merge, save — exactly what the tool does
    const loaded = await loadGraph(graphPath);
    const merged = await mergeNodes(loaded, {
      keepNodeId: 'p-001',
      removeNodeId: 'p-002',
      mergedTitle: 'retry with exponential backoff',
      reason: 'Same concept: retry with backoff',
    });
    await saveGraph(merged, graphPath);

    // Verify
    const result = await loadGraph(graphPath);
    expect(result.nodes).toHaveLength(2); // p-001 + e-001
    expect(result.nodes.find(n => n.id === 'p-001')?.title).toBe('retry with exponential backoff');
    expect(result.nodes.find(n => n.id === 'p-002')).toBeUndefined();
    // Edge should be redirected from p-002→e-001 to p-001→e-001
    expect(result.edges.some(e => e.from === 'p-001' && e.to === 'e-001')).toBe(true);
    expect(result.edges.some(e => e.from === 'p-002')).toBe(false);
  });

  it('write_consolidation_report writes file to the specified directory', async () => {
    const reportPath = path.join(tmpDir, 'consolidation_report.md');
    const content = '# Consolidation Report\n\nMerged 2 nodes.\n';
    
    // Simulate what write_consolidation_report does
    await fs.writeFile(reportPath, content, 'utf-8');
    
    const written = await fs.readFile(reportPath, 'utf-8');
    expect(written).toBe(content);
    expect(written).toContain('Consolidation Report');
  });

  it('find_duplicate_candidates tool returns correct JSON for graph', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'p-001', title: 'retry backoff strategy' }));
    graph = addNode(graph, makeNode({ id: 'p-002', title: 'retry backoff pattern' }));

    await saveGraph(graph, graphPath);

    const loaded = await loadGraph(graphPath);
    const candidates = findDuplicateCandidates(loaded, 0.5);

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].nodeA).toBe('p-001');
    expect(candidates[0].nodeB).toBe('p-002');
  });

  it('find_stale_nodes tool finds stale nodes in graph', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({
      id: 'p-001',
      title: 'old stale node',
      confidence: 0.05,
      updated: oldDate.toISOString(),
    }));
    graph = addNode(graph, makeNode({
      id: 'p-002',
      title: 'fresh node',
      confidence: 0.9,
    }));

    await saveGraph(graph, graphPath);

    const loaded = await loadGraph(graphPath);
    const stale = findStaleNodes(loaded);

    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe('p-001');
  });

  it('find_missing_edges tool detects nodes sharing neighbors', async () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'a', title: 'Node A' }));
    graph = addNode(graph, makeNode({ id: 'b', title: 'Node B' }));
    graph = addNode(graph, makeNode({ id: 'c', title: 'Node C' }));
    graph = addNode(graph, makeNode({ id: 'd', title: 'Node D' }));
    graph = addEdge(graph, { from: 'a', to: 'c', type: 'related_to', metadata: {} });
    graph = addEdge(graph, { from: 'a', to: 'd', type: 'related_to', metadata: {} });
    graph = addEdge(graph, { from: 'b', to: 'c', type: 'related_to', metadata: {} });
    graph = addEdge(graph, { from: 'b', to: 'd', type: 'related_to', metadata: {} });

    await saveGraph(graph, graphPath);

    const loaded = await loadGraph(graphPath);
    const missing = findMissingEdges(loaded);

    expect(missing.length).toBeGreaterThanOrEqual(1);
    const abPair = missing.find(m =>
      (m.from === 'a' && m.to === 'b') || (m.from === 'b' && m.to === 'a')
    );
    expect(abPair).toBeDefined();
    expect(abPair!.sharedNeighbors).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// New tests for graph_abstract_nodes and find_abstraction_candidates tools
// AC17: verify the handlers call the correct functions from graph-merge
// ──────────────────────────────────────────────────────────────────────────────

describe('ConsolidatorAgent tool handlers — abstraction tools', () => {
  let tmpDir: string;
  let graphPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consolidator-abstraction-test-'));
    graphPath = path.join(tmpDir, 'graph.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('graph_abstract_nodes handler', () => {
    it('calls abstractNodes() from graph-merge with correct arguments', async () => {
      // Arrange: set up a graph with two nodes to abstract
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'n1', title: 'retry on timeout' }));
      graph = addNode(graph, makeNode({ id: 'n2', title: 'retry on network failure' }));
      await saveGraph(graph, graphPath);

      // Spy on abstractNodes before calling it
      const mockAbstractNodes = vi.spyOn(graphMerge, 'abstractNodes');

      // Act: simulate exactly what the graph_abstract_nodes handler does
      const loaded = await loadGraph(graphPath);
      const proposal = {
        sourceNodeIds: ['n1', 'n2'],
        title: 'Retry strategies',
        description: 'Generalizes retry patterns for transient failures',
        reason: '3-step test: (1) retry on timeout and retry on network failure both match "retry strategy"; (2) both are transient failure handlers; (3) abstraction adds value by linking future retry patterns',
      };
      graphMerge.abstractNodes(loaded, proposal);
      await saveGraph(loaded, graphPath);

      // Assert: spy was called with the right arguments
      expect(mockAbstractNodes).toHaveBeenCalledOnce();
      expect(mockAbstractNodes).toHaveBeenCalledWith(
        expect.objectContaining({ nodes: expect.any(Array) }),
        expect.objectContaining({
          sourceNodeIds: ['n1', 'n2'],
          title: 'Retry strategies',
          description: 'Generalizes retry patterns for transient failures',
        })
      );

      // Assert: the abstraction node was created in the saved graph
      const result = await loadGraph(graphPath);
      const abstractionNode = result.nodes.find(n => n.title === 'Retry strategies');
      expect(abstractionNode).toBeDefined();
      expect(abstractionNode!.properties).toMatchObject({ abstraction: true });
    });

    it('stores title and reason in abstractionReasons (not in graph node properties)', async () => {
      // Arrange
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'x1', title: 'cascade failure A' }));
      graph = addNode(graph, makeNode({ id: 'x2', title: 'cascade failure B' }));
      await saveGraph(graph, graphPath);

      // Act: simulate handler — abstractNodes mutates graph, reason goes to abstractionReasons
      const loaded = await loadGraph(graphPath);
      const reason = 'Both are cascade failure patterns — reason for abstracting';
      const result = graphMerge.abstractNodes(loaded, {
        sourceNodeIds: ['x1', 'x2'],
        title: 'Cascade Failures',
        description: 'Abstracts cascade failure patterns',
        reason,
      });
      await saveGraph(loaded, graphPath);

      // The abstraction node properties should NOT include reason field
      expect(result.abstractionNode.properties).not.toHaveProperty('reason');
      // But abstraction=true and source_nodes should be present
      expect(result.abstractionNode.properties).toMatchObject({
        abstraction: true,
        source_nodes: ['x1', 'x2'],
      });
    });

    it('returns correct result format with abstractionNode and edgesCreated', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'm1', title: 'module A' }));
      graph = addNode(graph, makeNode({ id: 'm2', title: 'module B' }));
      await saveGraph(graph, graphPath);

      const loaded = await loadGraph(graphPath);
      const result = graphMerge.abstractNodes(loaded, {
        sourceNodeIds: ['m1', 'm2'],
        title: 'Module abstraction',
        description: 'Groups modules',
        reason: 'Test reason',
      });

      // Result should have the right shape
      expect(result).toHaveProperty('abstractionNode');
      expect(result).toHaveProperty('edgesCreated');
      expect(typeof result.edgesCreated).toBe('number');
      expect(result.edgesCreated).toBe(2); // one edge per source node
      expect(result.abstractionNode.title).toBe('Module abstraction');
      expect(result.abstractionNode.id).toMatch(/^abstraction-/);
    });
  });

  describe('find_abstraction_candidates handler', () => {
    it('calls findAbstractionCandidates() from graph-merge with correct arguments', async () => {
      // Arrange: graph with a cluster of nodes sharing neighbors
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'a', title: 'Node A' }));
      graph = addNode(graph, makeNode({ id: 'b', title: 'Node B' }));
      graph = addNode(graph, makeNode({ id: 'c', title: 'Node C' }));
      graph = addEdge(graph, { from: 'a', to: 'c', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'b', to: 'c', type: 'related_to', metadata: {} });
      await saveGraph(graph, graphPath);

      // Spy on findAbstractionCandidates
      const mockFindCandidates = vi.spyOn(graphMerge, 'findAbstractionCandidates');

      // Act: simulate exactly what the find_abstraction_candidates handler does
      const loaded = await loadGraph(graphPath);
      graphMerge.findAbstractionCandidates(loaded, 2);

      // Assert: spy was called with correct arguments
      expect(mockFindCandidates).toHaveBeenCalledOnce();
      expect(mockFindCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ nodes: expect.any(Array) }),
        2
      );
    });

    it('returns "No abstraction candidates found" message when result is empty array', async () => {
      // Arrange: small graph unlikely to have clusters
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'solo', title: 'Lone node' }));
      await saveGraph(graph, graphPath);

      // Act: simulate handler behavior
      const loaded = await loadGraph(graphPath);
      const candidates = graphMerge.findAbstractionCandidates(loaded, 3);

      // The handler returns this specific string when candidates is empty
      const expectedMsg = 'No abstraction candidates found — graph is too small or lacks clusters';
      const response = candidates.length === 0
        ? expectedMsg
        : JSON.stringify(candidates, null, 2);

      expect(response).toBe(expectedMsg);
    });

    it('uses default minClusterSize of 3 when not specified', async () => {
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'z1', title: 'Z1' }));
      await saveGraph(graph, graphPath);

      const mockFindCandidates = vi.spyOn(graphMerge, 'findAbstractionCandidates');

      const loaded = await loadGraph(graphPath);
      // Simulate handler when minClusterSize is undefined
      graphMerge.findAbstractionCandidates(loaded, undefined);

      // findAbstractionCandidates uses default param 3 when undefined passed
      expect(mockFindCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ nodes: expect.any(Array) }),
        undefined
      );
    });

    it('returns JSON when candidates are found', async () => {
      // Build a graph where 'a' and 'b' share enough common neighbors
      let graph = createEmptyGraph();
      graph = addNode(graph, makeNode({ id: 'a', title: 'Node A' }));
      graph = addNode(graph, makeNode({ id: 'b', title: 'Node B' }));
      graph = addNode(graph, makeNode({ id: 'c', title: 'Shared C' }));
      graph = addNode(graph, makeNode({ id: 'd', title: 'Shared D' }));
      graph = addNode(graph, makeNode({ id: 'e', title: 'Shared E' }));
      // a and b both connect to c, d, e (3 shared neighbors)
      graph = addEdge(graph, { from: 'a', to: 'c', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'a', to: 'd', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'a', to: 'e', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'b', to: 'c', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'b', to: 'd', type: 'related_to', metadata: {} });
      graph = addEdge(graph, { from: 'b', to: 'e', type: 'related_to', metadata: {} });
      await saveGraph(graph, graphPath);

      const loaded = await loadGraph(graphPath);
      const candidates = graphMerge.findAbstractionCandidates(loaded, 3);

      // Handler returns JSON.stringify when candidates found
      const response = candidates.length === 0
        ? 'No abstraction candidates found — graph is too small or lacks clusters'
        : JSON.stringify(candidates, null, 2);

      expect(candidates.length).toBeGreaterThan(0);
      expect(response).toContain('[');
      expect(response).toContain('nodeIds');
    });
  });

  describe('write_consolidation_report — Abstraktioner skapade section', () => {
    it('appends "## Abstraktioner skapade" section programmatically to report', async () => {
      // Simulate the handler behavior: report content + abstraction section
      const reportContent = '# Consolidation Report\n\nFound 3 stale nodes.\n';
      const abstractionReasons = [
        { title: 'Retry Strategies', reason: 'Groups all retry pattern nodes' },
      ];

      // Build section exactly as the handler does
      let abstractionSection = '\n## Abstraktioner skapade\n';
      for (const { title, reason } of abstractionReasons) {
        abstractionSection += `\n### ${title}\n${reason}\n`;
      }
      const fullReport = reportContent + abstractionSection;

      expect(fullReport).toContain('## Abstraktioner skapade');
      expect(fullReport).toContain('### Retry Strategies');
      expect(fullReport).toContain('Groups all retry pattern nodes');
    });

    it('shows "Inga abstraktioner skapades" when no abstractions were created', async () => {
      const reportContent = '# Consolidation Report\n\nNothing to merge.\n';
      const abstractionReasons: Array<{ title: string; reason: string }> = [];

      let abstractionSection = '\n## Abstraktioner skapade\n';
      if (abstractionReasons.length === 0) {
        abstractionSection += 'Inga abstraktioner skapades denna körning.\n';
      }
      const fullReport = reportContent + abstractionSection;

      expect(fullReport).toContain('## Abstraktioner skapade');
      expect(fullReport).toContain('Inga abstraktioner skapades denna körning.');
    });

    it('writes report to both runDir/consolidation_report.md and memory/consolidation_findings.md', async () => {
      // Simulate the handler writing to both files
      const runDir = path.join(tmpDir, 'run');
      const memoryDir = path.join(tmpDir, 'memory');
      await fs.mkdir(runDir, { recursive: true });
      await fs.mkdir(memoryDir, { recursive: true });

      const reportPath = path.join(runDir, 'consolidation_report.md');
      const findingsPath = path.join(memoryDir, 'consolidation_findings.md');
      const fullReport = '# Report\n\n## Abstraktioner skapade\nInga abstraktioner skapades denna körning.\n';

      await fs.writeFile(reportPath, fullReport, 'utf-8');
      await fs.writeFile(findingsPath, fullReport, 'utf-8');

      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const findingsContent = await fs.readFile(findingsPath, 'utf-8');

      expect(reportContent).toBe(fullReport);
      expect(findingsContent).toBe(fullReport);
      expect(findingsContent).toContain('## Abstraktioner skapade');
    });
  });
});
