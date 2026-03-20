import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';

// Mock knowledge graph to control loadGraph return value
vi.mock('../../../src/core/knowledge-graph.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    loadGraph: vi.fn(),
  };
});

// Mock db module to avoid real DB connections
vi.mock('../../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(false),
  getPool: vi.fn(),
}));

// Mock embeddings module
vi.mock('../../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

import { ReviewerAgent, isHighRisk } from '../../../src/core/agents/reviewer.js';
import { createPolicyEnforcer } from '../../../src/core/policy.js';
import { loadGraph } from '../../../src/core/knowledge-graph.js';
import type { KnowledgeGraph } from '../../../src/core/knowledge-graph.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

/**
 * Create a mock RunContext for testing the reviewer agent.
 */
function createMockContext(policy: any, runDir: string, workspaceDir: string) {
  return {
    runid: '20260222-1200-test',
    target: { name: 'test-target', path: '/tmp/test-target', default_branch: 'main' },
    hours: 1,
    workspaceDir,
    runDir,
    policy,
    audit: { log: async () => {} },
    manifest: { addCommand: async () => {} },
    usage: { recordTokens: () => {}, recordToolCall: () => {} },
    artifacts: { readBrief: async () => '# Brief\n\nTest brief.' },
    startTime: new Date(),
    endTime: new Date(Date.now() + 3_600_000),
  } as any;
}

/** Test graph with error, pattern, and idea nodes. */
const testGraph: KnowledgeGraph = {
  version: '1.0',
  nodes: [
    {
      id: 'e-1',
      type: 'error',
      title: 'PPR timeout error',
      properties: { description: 'Timeout during pagerank' },
      created: '2026-03-01T00:00:00Z',
      updated: '2026-03-01T00:00:00Z',
      confidence: 0.7,
      scope: 'universal',
      model: null,
    },
    {
      id: 'p-1',
      type: 'pattern',
      title: 'Graph navigation pattern',
      properties: { description: 'Use PPR for navigation' },
      created: '2026-03-01T00:00:00Z',
      updated: '2026-03-01T00:00:00Z',
      confidence: 0.85,
      scope: 'universal',
      model: null,
    },
    {
      id: 'i-1',
      type: 'idea',
      title: 'PPR idea',
      properties: { description: 'Some PPR idea', impact: 3, effort: 2 },
      created: '2026-03-01T00:00:00Z',
      updated: '2026-03-01T00:00:00Z',
      confidence: 0.6,
      scope: 'universal',
      model: null,
    },
  ],
  edges: [],
  lastUpdated: '2026-03-01T00:00:00Z',
};

/** Empty graph for negative tests. */
const emptyGraph: KnowledgeGraph = {
  version: '1.0',
  nodes: [],
  edges: [],
  lastUpdated: '2026-03-01T00:00:00Z',
};

describe('ReviewerAgent — graph context integration', () => {
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewer-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    // Create brief.md that the reviewer will read
    await fs.writeFile(
      path.join(runDir, 'brief.md'),
      '# Brief\n\nImplement PPR algorithm for graph navigation.',
      'utf-8',
    );

    // Reset loadGraph mock before each test
    vi.mocked(loadGraph).mockReset();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('AC15: includes graph context when matching error/pattern nodes exist', async () => {
    vi.mocked(loadGraph).mockResolvedValue(testGraph);

    const agent = new ReviewerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    // Check for the unique content from graph injection (not the instructional text in reviewer.md)
    expect(prompt).toContain('Dessa errors och patterns från tidigare körningar kan vara relevanta');
    expect(prompt).toContain('PPR timeout error');
    expect(prompt).toContain('Graph navigation pattern');
  });

  it('AC16: reviewer does NOT see idea nodes — only error and pattern', async () => {
    vi.mocked(loadGraph).mockResolvedValue(testGraph);

    const agent = new ReviewerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    // Error and pattern should be present with their prefixes
    expect(prompt).toContain('[E]');
    expect(prompt).toContain('[P]');
    // Idea node should NOT appear in the prompt
    expect(prompt).not.toContain('PPR idea');
  });

  it('AC17: omits graph section when no relevant errors/patterns exist', async () => {
    vi.mocked(loadGraph).mockResolvedValue(emptyGraph);

    const agent = new ReviewerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    // The injected graph context should not appear
    expect(prompt).not.toContain('Dessa errors och patterns från tidigare körningar kan vara relevanta');
    // Core prompt should still work
    expect(prompt).toContain('Run Context');
    expect(prompt).toContain('Your Mission');
  });

  it('AC18: isHighRisk detects HIGH risk correctly', () => {
    expect(isHighRisk('## Risk\n\n**High.**')).toBe(true);
    expect(isHighRisk('## Risk\n\n**High**')).toBe(true);
    expect(isHighRisk('## Risk\n\n**Low**')).toBe(false);
    expect(isHighRisk('No risk section here')).toBe(false);
  });

  it('graceful degradation: prompt works when loadGraph throws', async () => {
    vi.mocked(loadGraph).mockRejectedValue(new Error('Graph file not found'));

    const agent = new ReviewerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    // Should not throw, and prompt should still be functional
    expect(prompt).toContain('Run Context');
    expect(prompt).toContain('Your Mission');
    expect(prompt).not.toContain('Dessa errors och patterns från tidigare körningar kan vara relevanta');
  });
});
