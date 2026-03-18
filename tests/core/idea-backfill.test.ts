import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  backfillIdeas,
  type KnowledgeGraph,
  type KGNode,
} from '../../src/core/knowledge-graph.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock DB + embeddings (not needed for backfill tests)
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

describe('backfillIdeas', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), 'neuron-test-' + Date.now());
    await fs.mkdir(tmpDir, { recursive: true });
  });

  function makeGraph(nodes: KGNode[] = []): KnowledgeGraph {
    return {
      version: '1.0',
      nodes,
      edges: [],
      lastUpdated: '2026-01-01T00:00:00Z',
    };
  }

  function makeOldIdeaNode(id: string): KGNode {
    return {
      id,
      type: 'idea',
      title: 'Old idea',
      properties: {
        impact: 'high',
        effort: 'low',
        status: 'proposed',
        description: 'old',
      },
      confidence: 0.5,
      scope: 'project-specific',
      model: null,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
    };
  }

  it('parses bullet-style ideas.md', async () => {
    const runDir = path.join(tmpDir, '20260301-1234-test');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'ideas.md'),
      '# Ideas\n\n## Logger\n- MultiWriter for logging\n- Log rotation support\n',
    );

    const graph = makeGraph();
    const result = await backfillIdeas(graph, tmpDir);
    const ideas = result.nodes.filter((n) => n.type === 'idea');
    expect(ideas.length).toBe(2);
    expect(ideas[0].properties.group).toBe('Logger');
  });

  it('parses numbered-style ideas.md', async () => {
    const runDir = path.join(tmpDir, '20260302-1234-test');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'ideas.md'),
      '# Ideas\n\n1. **MultiWriter** \u2014 Compose multiple LogWriters\n2. **Langfuse LogWriter** \u2014 Send structured logs\n',
    );

    const graph = makeGraph();
    const result = await backfillIdeas(graph, tmpDir);
    const ideas = result.nodes.filter((n) => n.type === 'idea');
    expect(ideas.length).toBe(2);
  });

  it('deduplicates ideas with same title', async () => {
    const run1 = path.join(tmpDir, '20260301-1234-test');
    const run2 = path.join(tmpDir, '20260302-1234-test');
    await fs.mkdir(run1, { recursive: true });
    await fs.mkdir(run2, { recursive: true });
    await fs.writeFile(
      path.join(run1, 'ideas.md'),
      '# Ideas\n- MultiWriter for logging\n',
    );
    await fs.writeFile(
      path.join(run2, 'ideas.md'),
      '# Ideas\n- MultiWriter for logging\n',
    );

    const graph = makeGraph();
    const result = await backfillIdeas(graph, tmpDir);
    const ideas = result.nodes.filter((n) => n.type === 'idea');
    expect(ideas).toHaveLength(1);
    expect(ideas[0].properties.mention_count).toBe(2);
  });

  it('extracts source_run from directory name', async () => {
    const runDir = path.join(tmpDir, '20260305-0800-myproject');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'ideas.md'),
      '# Ideas\n- Some idea\n',
    );

    const graph = makeGraph();
    const result = await backfillIdeas(graph, tmpDir);
    const ideas = result.nodes.filter((n) => n.type === 'idea');
    expect(ideas[0].properties.source_run).toBe('20260305-0800-myproject');
  });

  it('is idempotent (run twice gives same result)', async () => {
    const runDir = path.join(tmpDir, '20260301-1234-test');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'ideas.md'),
      '# Ideas\n- Idea A\n- Idea B\n',
    );

    const graph = makeGraph();
    const result1 = await backfillIdeas(graph, tmpDir);
    const result2 = await backfillIdeas(result1, tmpDir);

    const ideas1 = result1.nodes.filter((n) => n.type === 'idea');
    const ideas2 = result2.nodes.filter((n) => n.type === 'idea');
    expect(ideas1.length).toBe(ideas2.length);
  });

  it('deletes old string-based idea nodes', async () => {
    const runDir = path.join(tmpDir, '20260301-1234-test');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'ideas.md'),
      '# Ideas\n- New idea\n',
    );

    const graph = makeGraph([
      makeOldIdeaNode('idea-old-001'),
      makeOldIdeaNode('idea-old-002'),
    ]);
    const result = await backfillIdeas(graph, tmpDir);
    // Old nodes should be gone
    expect(result.nodes.find((n) => n.id === 'idea-old-001')).toBeUndefined();
    expect(result.nodes.find((n) => n.id === 'idea-old-002')).toBeUndefined();
    // New node should exist
    const ideas = result.nodes.filter((n) => n.type === 'idea');
    expect(ideas.length).toBe(1);
  });

  it('computes priority for each idea', async () => {
    const runDir = path.join(tmpDir, '20260301-1234-test');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'ideas.md'),
      '# Ideas\n- Critical one-line fix\n',
    );

    const graph = makeGraph();
    const result = await backfillIdeas(graph, tmpDir);
    const ideas = result.nodes.filter((n) => n.type === 'idea');
    expect(ideas[0].properties.priority).toBeDefined();
    expect(typeof ideas[0].properties.priority).toBe('number');
  });

  it('handles empty runs directory', async () => {
    const graph = makeGraph();
    const result = await backfillIdeas(graph, tmpDir);
    expect(result.nodes.filter((n) => n.type === 'idea')).toHaveLength(0);
  });

  it('preserves non-idea nodes', async () => {
    const runDir = path.join(tmpDir, '20260301-1234-test');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'ideas.md'),
      '# Ideas\n- Some idea\n',
    );

    const patternNode: KGNode = {
      id: 'pattern-001',
      type: 'pattern',
      title: 'Test pattern',
      properties: { description: 'keep me' },
      confidence: 0.9,
      scope: 'universal',
      model: null,
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
    };
    const graph = makeGraph([patternNode, makeOldIdeaNode('idea-old')]);
    const result = await backfillIdeas(graph, tmpDir);
    expect(result.nodes.find((n) => n.id === 'pattern-001')).toBeDefined();
  });

  it('handles non-existent runs directory gracefully', async () => {
    const graph = makeGraph();
    const result = await backfillIdeas(graph, '/nonexistent/path');
    expect(result.nodes.filter((n) => n.type === 'idea')).toHaveLength(0);
  });
});
