import { describe, it, expect } from 'vitest';
import {
  findDuplicateCandidates,
  jaccardSimilarity,
} from '../../src/core/graph-merge.js';
import { createEmptyGraph, addNode, type KGNode } from '../../src/core/knowledge-graph.js';

// Test that Jaccard misses semantically similar terms
describe('Consolidator semantic dedup', () => {
  it('Jaccard misses semantically similar but differently-worded nodes', () => {
    const graph = createEmptyGraph();
    const node1: KGNode = {
      id: 'p-1',
      type: 'pattern',
      title: 'retry-logik vid API-fel',
      properties: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.8,
      scope: 'universal',
    };
    const node2: KGNode = {
      id: 'p-2',
      type: 'pattern',
      title: 'automatisk omsändning vid nätverksfel',
      properties: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.7,
      scope: 'universal',
    };

    let g = addNode(graph, node1);
    g = addNode(g, node2);

    // Jaccard should find low similarity (different words)
    const sim = jaccardSimilarity(
      'retry-logik vid api-fel',
      'automatisk omsändning vid nätverksfel'
    );
    expect(sim).toBeLessThan(0.6);

    // Therefore findDuplicateCandidates should NOT find them
    const candidates = findDuplicateCandidates(g, 0.6);
    expect(candidates.length).toBe(0);
  });

  it('Jaccard finds similar nodes with overlapping words', () => {
    const sim = jaccardSimilarity(
      'retry logic api errors',
      'retry logic network errors'
    );
    expect(sim).toBeGreaterThan(0.5);
  });
});

// Test the enhanced consolidator method via mock
describe('Consolidator with semantic search', () => {
  it('findSimilarNodes interface is correct', async () => {
    // Verify the findSimilarNodes function exists and has the right signature
    const { findSimilarNodes } = await import('../../src/core/semantic-search.js');
    expect(typeof findSimilarNodes).toBe('function');
  });

  it('isEmbeddingAvailable can be checked', async () => {
    const { isEmbeddingAvailable } = await import('../../src/core/embeddings.js');
    expect(typeof isEmbeddingAvailable).toBe('function');
    // Without actual Ollama, should return false
    const result = await isEmbeddingAvailable();
    expect(result).toBe(false);
  });

  it('Jaccard baseline still works without embeddings', () => {
    const graph = createEmptyGraph();
    const node1: KGNode = {
      id: 'p-1',
      type: 'pattern',
      title: 'context window management strategy',
      properties: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.8,
      scope: 'universal',
    };
    const node2: KGNode = {
      id: 'p-2',
      type: 'pattern',
      title: 'context window management optimization',
      properties: {},
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      confidence: 0.7,
      scope: 'universal',
    };

    let g = addNode(graph, node1);
    g = addNode(g, node2);

    const candidates = findDuplicateCandidates(g, 0.5);
    expect(candidates.length).toBe(1);
    expect(candidates[0].nodeA).toBe('p-1');
    expect(candidates[0].nodeB).toBe('p-2');
  });
});
