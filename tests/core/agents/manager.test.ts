import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';

// Mock sub-agents to prevent real instantiation
vi.mock('../../../src/core/agents/implementer.js', () => ({
  ImplementerAgent: vi.fn().mockImplementation(() => ({ run: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('../../../src/core/agents/reviewer.js', () => ({
  ReviewerAgent: vi.fn().mockImplementation(() => ({ run: vi.fn().mockResolvedValue(undefined) })),
}));

// Mock run-statistics
vi.mock('../../../src/core/run-statistics.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getBeliefs: vi.fn().mockResolvedValue([]),
    classifyBrief: vi.fn().mockResolvedValue('feature' as const),
  };
});

// Mock knowledge-graph to control what graph data is available
vi.mock('../../../src/core/knowledge-graph.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    loadGraph: vi.fn(),
    rankIdeas: vi.fn().mockReturnValue([]),
  };
});

import { ManagerAgent } from '../../../src/core/agents/manager.js';
import { createPolicyEnforcer } from '../../../src/core/policy.js';
import { loadGraph, rankIdeas } from '../../../src/core/knowledge-graph.js';
import type { KnowledgeGraph, KGNode } from '../../../src/core/knowledge-graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

// Unique string from formatGraphContextForManager that does NOT appear in prompts/manager.md
const GRAPH_SECTION_MARKER = 'Baserat på briefens innehåll';

/**
 * Create a mock RunContext for testing buildSystemPrompt().
 */
function createMockContext(
  policy: any,
  runDir: string,
  workspaceDir: string,
  auditLogFn: (...args: any[]) => Promise<void> = async () => {},
) {
  return {
    runid: '20260320-1200-test' as any,
    target: { name: 'test-target', path: '/tmp/test-target', default_branch: 'main' },
    hours: 1,
    workspaceDir,
    runDir,
    policy,
    audit: { log: auditLogFn },
    manifest: { addCommand: async () => {} },
    usage: { recordTokens: () => {}, recordToolCall: () => {} },
    artifacts: {
      readBrief: async () => '# Brief\n\nImplement PPR algorithm for graph navigation using Personalized PageRank.',
    },
    startTime: new Date(),
    endTime: new Date(Date.now() + 3_600_000),
  } as any;
}

/**
 * Helper to create a KGNode for test fixtures.
 */
function makeNode(overrides: Partial<KGNode> & { id: string; type: KGNode['type']; title: string }): KGNode {
  return {
    properties: {},
    created: '2026-03-01T00:00:00Z',
    updated: '2026-03-01T00:00:00Z',
    confidence: 0.8,
    scope: 'universal',
    model: null,
    ...overrides,
  } as KGNode;
}

/**
 * Build a KnowledgeGraph with the given nodes.
 */
function makeGraph(nodes: KGNode[]): KnowledgeGraph {
  return {
    version: '1.0',
    nodes,
    edges: [],
    lastUpdated: '2026-03-01T00:00:00Z',
  };
}

describe('ManagerAgent — graph context integration', () => {
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manager-graph-test-'));
    runDir = path.join(tmpDir, 'runs', '20260320-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    // Reset mocks
    vi.mocked(loadGraph).mockReset();
    vi.mocked(rankIdeas).mockReset().mockReturnValue([]);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('AC11: includes graph context section when graph has keyword-matching nodes', async () => {
    const testGraph = makeGraph([
      makeNode({
        id: 'p-1', type: 'pattern', title: 'PPR Algorithm Pattern',
        properties: { description: 'PageRank graph navigation' },
        confidence: 0.85,
      }),
      makeNode({
        id: 'e-1', type: 'error', title: 'Graph timeout error',
        properties: { description: 'Timeout in pagerank computation' },
        confidence: 0.7,
      }),
      makeNode({
        id: 'i-1', type: 'idea', title: 'PPR reranking idea',
        properties: { description: 'Use PPR scores for reranking', impact: 4, effort: 2 },
        confidence: 0.6,
      }),
    ]);
    vi.mocked(loadGraph).mockResolvedValue(testGraph);

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    expect(prompt).toContain(GRAPH_SECTION_MARKER);
    expect(prompt).toContain('PPR Algorithm Pattern');
    expect(prompt).toContain('Graph timeout error');
  });

  it('AC12 - fallback 0 nodes: when no matching nodes but ideas exist, includes top-5 ideas', async () => {
    // Graph with no nodes that match brief keywords
    const testGraph = makeGraph([
      makeNode({
        id: 'p-unrelated', type: 'pattern', title: 'Unrelated CSS Pattern',
        properties: { description: 'CSS grid layout tips' },
        confidence: 0.9,
      }),
    ]);
    vi.mocked(loadGraph).mockResolvedValue(testGraph);

    const mockIdea = makeNode({
      id: 'idea-top-1', type: 'idea', title: 'Top ranked idea',
      properties: { impact: 5, effort: 2, priority: 4.0, group: 'General' },
      confidence: 0.8,
    });
    vi.mocked(rankIdeas).mockReturnValue([mockIdea]);

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    expect(prompt).toContain(GRAPH_SECTION_MARKER);
    expect(prompt).toContain('Top-rankade idéer');
    expect(prompt).toContain('Top ranked idea');
    expect(prompt).toContain('impact:5');
  });

  it('AC12 - fallback 1-2 nodes: includes both brief-context AND top-5 ideas', async () => {
    // Graph with only 1 matching node (below the >=3 threshold)
    const testGraph = makeGraph([
      makeNode({
        id: 'p-1', type: 'pattern', title: 'PPR Algorithm Pattern',
        properties: { description: 'PageRank graph navigation' },
        confidence: 0.85,
      }),
    ]);
    vi.mocked(loadGraph).mockResolvedValue(testGraph);

    const mockIdea = makeNode({
      id: 'idea-top-1', type: 'idea', title: 'Top ranked idea',
      properties: { impact: 5, effort: 2, priority: 4.0, group: 'General' },
      confidence: 0.8,
    });
    vi.mocked(rankIdeas).mockReturnValue([mockIdea]);

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    // Should contain both brief-context nodes AND top-5 ideas
    expect(prompt).toContain(GRAPH_SECTION_MARKER);
    expect(prompt).toContain('PPR Algorithm Pattern');
    expect(prompt).toContain('Top-rankade idéer');
    expect(prompt).toContain('Top ranked idea');
  });

  it('AC12 - >=3 nodes: uses only brief context (no top-5 ideas section)', async () => {
    const testGraph = makeGraph([
      makeNode({
        id: 'p-1', type: 'pattern', title: 'PPR Algorithm Pattern',
        properties: { description: 'PageRank graph navigation' },
        confidence: 0.85,
      }),
      makeNode({
        id: 'e-1', type: 'error', title: 'Graph timeout error',
        properties: { description: 'Timeout in pagerank computation' },
        confidence: 0.7,
      }),
      makeNode({
        id: 'i-1', type: 'idea', title: 'PPR reranking idea',
        properties: { description: 'Use PPR scores for reranking', impact: 4, effort: 2 },
        confidence: 0.6,
      }),
    ]);
    vi.mocked(loadGraph).mockResolvedValue(testGraph);

    // Even though we provide rankIdeas results, they should NOT be used when >=3 nodes
    const mockIdea = makeNode({
      id: 'idea-top-1', type: 'idea', title: 'Top ranked idea SHOULD NOT APPEAR',
      properties: { impact: 5, effort: 2, priority: 4.0, group: 'General' },
      confidence: 0.8,
    });
    vi.mocked(rankIdeas).mockReturnValue([mockIdea]);

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    expect(prompt).toContain(GRAPH_SECTION_MARKER);
    expect(prompt).toContain('PPR Algorithm Pattern');
    // rankIdeas should NOT have been called when >=3 nodes
    expect(rankIdeas).not.toHaveBeenCalled();
    expect(prompt).not.toContain('Top-rankade idéer');
    expect(prompt).not.toContain('SHOULD NOT APPEAR');
  });

  it('AC14: when graph has no ideas AND no matching nodes, graph section is omitted entirely', async () => {
    // Graph with no matching nodes
    const testGraph = makeGraph([
      makeNode({
        id: 'p-unrelated', type: 'pattern', title: 'Unrelated CSS Pattern',
        properties: { description: 'CSS grid layout tips' },
        confidence: 0.9,
      }),
    ]);
    vi.mocked(loadGraph).mockResolvedValue(testGraph);
    vi.mocked(rankIdeas).mockReturnValue([]);

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    // The formatted graph section should NOT be present
    expect(prompt).not.toContain(GRAPH_SECTION_MARKER);
    expect(prompt).not.toContain('Top-rankade idéer');
    // Prompt should still work
    expect(prompt).toContain('Run Context');
  });

  it('graceful degradation: when loadGraph throws, prompt works without graph section', async () => {
    vi.mocked(loadGraph).mockRejectedValue(new Error('ENOENT: graph.json not found'));

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    expect(prompt).not.toContain(GRAPH_SECTION_MARKER);
    expect(prompt).toContain('Run Context');
  });
});
