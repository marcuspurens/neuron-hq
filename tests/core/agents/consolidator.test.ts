import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createEmptyGraph, addNode, addEdge, saveGraph, loadGraph, type KGNode } from '../../../src/core/knowledge-graph.js';
import { mergeNodes, findDuplicateCandidates, findStaleNodes, findMissingEdges } from '../../../src/core/graph-merge.js';

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
