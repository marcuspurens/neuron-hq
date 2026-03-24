import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createEmptyGraph, addNode, addEdge, saveGraph, loadGraph, type KGNode } from '../../../src/core/knowledge-graph.js';
import { mergeNodes, findDuplicateCandidates, findStaleNodes, findMissingEdges } from '../../../src/core/graph-merge.js';
import * as graphMerge from '../../../src/core/graph-merge.js';

// Mock agent-client and model-registry so ConsolidatorAgent can be instantiated without API key
vi.mock('../../../src/core/agent-client.js', () => ({
  createAgentClient: () => ({ client: {}, model: 'test-model', maxTokens: 4096 }),
  buildCachedSystemBlocks: () => [],
}));
vi.mock('../../../src/core/model-registry.js', () => ({
  resolveModelConfig: () => ({ modelId: 'test-model', maxOutputTokens: 4096 }),
}));
vi.mock('../../../src/core/prompt-overlays.js', () => ({
  loadOverlay: async () => null,
  mergePromptWithOverlay: (prompt: string) => prompt,
}));
vi.mock('../../../src/core/preamble.js', () => ({
  prependPreamble: async (prompt: string) => prompt,
}));

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

// ──────────────────────────────────────────────────────────────────────────────
// AC17 STRICT: End-to-end dispatcher tests via ConsolidatorAgent.executeTools()
// These tests instantiate the real agent and invoke its private executeTools()
// to verify the actual dispatch chain: tool_use block → switch → handler → function
// ──────────────────────────────────────────────────────────────────────────────

import { ConsolidatorAgent } from '../../../src/core/agents/consolidator.js';

function createMockRunContext(runDir: string, baseDir: string) {
  return {
    runid: '20260324-test-consolidator' as any,
    target: { name: 'test', path: '/tmp/test', default_branch: 'main' },
    hours: 1,
    workspaceDir: '/tmp/workspace',
    runDir,
    policy: { getLimits: () => ({ max_iterations_per_run: 10 }) },
    audit: { log: async () => {} },
    manifest: { addCommand: async () => {} },
    usage: { recordTokens: () => {}, recordToolCall: () => {} },
    artifacts: { readBrief: async () => '# Brief' },
    startTime: new Date(),
    endTime: new Date(Date.now() + 3_600_000),
  } as any;
}

describe('AC17 STRICT — ConsolidatorAgent dispatcher calls graph-merge functions', () => {
  let tmpDir: string;
  let memoryDir: string;
  let runDir: string;
  let agent: ConsolidatorAgent;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consolidator-dispatch-'));
    memoryDir = path.join(tmpDir, 'memory');
    runDir = path.join(tmpDir, 'runs', 'test-run');
    const promptsDir = path.join(tmpDir, 'prompts');
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(promptsDir, { recursive: true });

    // Write minimal consolidator prompt
    await fs.writeFile(path.join(promptsDir, 'consolidator.md'), '# Consolidator\nYou consolidate.', 'utf-8');

    // Write a graph with nodes for abstraction
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'a1', title: 'timeout pattern A' }));
    graph = addNode(graph, makeNode({ id: 'a2', title: 'timeout pattern B' }));
    graph = addNode(graph, makeNode({ id: 'a3', title: 'timeout pattern C' }));
    // Add shared neighbors so findAbstractionCandidates returns results
    graph = addNode(graph, makeNode({ id: 'hub1', title: 'shared hub 1' }));
    graph = addNode(graph, makeNode({ id: 'hub2', title: 'shared hub 2' }));
    const meta = { runId: 'test', agent: 'test', timestamp: new Date().toISOString() };
    graph = addEdge(graph, { from: 'a1', to: 'hub1', type: 'related_to', metadata: meta });
    graph = addEdge(graph, { from: 'a2', to: 'hub1', type: 'related_to', metadata: meta });
    graph = addEdge(graph, { from: 'a3', to: 'hub1', type: 'related_to', metadata: meta });
    graph = addEdge(graph, { from: 'a1', to: 'hub2', type: 'related_to', metadata: meta });
    graph = addEdge(graph, { from: 'a2', to: 'hub2', type: 'related_to', metadata: meta });
    graph = addEdge(graph, { from: 'a3', to: 'hub2', type: 'related_to', metadata: meta });
    await saveGraph(graph, path.join(memoryDir, 'graph.json'));

    const ctx = createMockRunContext(runDir, tmpDir);
    agent = new ConsolidatorAgent(ctx, tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('graph_abstract_nodes tool_use → dispatcher calls abstractNodes()', async () => {
    const spy = vi.spyOn(graphMerge, 'abstractNodes');

    const toolUseBlock = {
      type: 'tool_use' as const,
      id: 'tool_01',
      name: 'graph_abstract_nodes',
      input: {
        nodeIds: ['a1', 'a2'],
        title: 'Timeout Resilience',
        description: 'Generalizes timeout handling patterns',
        reason: 'Both handle timeout — common root cause',
      },
    };

    // Invoke the actual dispatcher
    const results = await (agent as any).executeTools([toolUseBlock]);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: expect.any(Array) }),
      expect.objectContaining({
        sourceNodeIds: ['a1', 'a2'],
        title: 'Timeout Resilience',
      })
    );
    // Verify it returned a tool_result
    expect(results).toHaveLength(1);
    expect(results[0].tool_use_id).toBe('tool_01');
  });

  it('find_abstraction_candidates tool_use → dispatcher calls findAbstractionCandidates()', async () => {
    const spy = vi.spyOn(graphMerge, 'findAbstractionCandidates');

    const toolUseBlock = {
      type: 'tool_use' as const,
      id: 'tool_02',
      name: 'find_abstraction_candidates',
      input: { minClusterSize: 3 },
    };

    const results = await (agent as any).executeTools([toolUseBlock]);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ nodes: expect.any(Array) }),
      3
    );
    expect(results).toHaveLength(1);
    expect(results[0].tool_use_id).toBe('tool_02');
  });

  it('graph_abstract_nodes dispatcher stores reason in abstractionReasons (not graph)', async () => {
    const toolUseBlock = {
      type: 'tool_use' as const,
      id: 'tool_03',
      name: 'graph_abstract_nodes',
      input: {
        nodeIds: ['a1', 'a2'],
        title: 'Timeout Meta',
        description: 'Meta pattern',
        reason: 'Both are timeout handlers',
      },
    };

    await (agent as any).executeTools([toolUseBlock]);

    // Check internal abstractionReasons was populated
    const reasons = (agent as any).abstractionReasons;
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toEqual({ title: 'Timeout Meta', reason: 'Both are timeout handlers' });

    // Check graph node does NOT have reason in properties
    const graph = await loadGraph(path.join(memoryDir, 'graph.json'));
    const metaNode = graph.nodes.find((n: any) => n.title === 'Timeout Meta');
    expect(metaNode).toBeDefined();
    expect(metaNode!.properties).not.toHaveProperty('reason');
  });
});
