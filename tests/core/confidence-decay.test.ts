import { describe, it, expect } from 'vitest';
import {
  createEmptyGraph,
  addNode,
  applyConfidenceDecay,
  type KGNode,
} from '../../src/core/knowledge-graph.js';

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

function makeOldDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

describe('applyConfidenceDecay', () => {
  it('sänker confidence på noder som inte uppdaterats inom maxRunsSinceConfirm', () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'old-1', confidence: 0.8, updated: makeOldDate(30) }));

    const result = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 20 });
    expect(result.nodes[0].confidence).toBeCloseTo(0.72, 2);
    expect(result.nodes[0].properties.decay_applied).toBe(true);
  });

  it('rör INTE noder som uppdaterats nyligen', () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'fresh-1', confidence: 0.8, updated: new Date().toISOString() }));

    const result = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 20 });
    expect(result.nodes[0].confidence).toBe(0.8);
    expect(result.nodes[0].properties.decay_applied).toBeUndefined();
  });

  it('sätter stale=true på noder under 0.1', () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'weak-1', confidence: 0.05, updated: makeOldDate(30) }));

    const result = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 20 });
    expect(result.nodes[0].confidence).toBeCloseTo(0.045, 3);
    expect(result.nodes[0].properties.stale).toBe(true);
  });

  it('respekterar anpassat decayFactor', () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'old-1', confidence: 1.0, updated: makeOldDate(30) }));

    const result = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 20, decayFactor: 0.5 });
    expect(result.nodes[0].confidence).toBeCloseTo(0.5, 2);
  });

  it('respekterar anpassat maxRunsSinceConfirm', () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'mid-1', confidence: 0.8, updated: makeOldDate(10) }));

    // With maxRuns=5, 10 days ago should decay
    const result5 = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 5 });
    expect(result5.nodes[0].confidence).toBeCloseTo(0.72, 2);

    // With maxRuns=15, 10 days ago should NOT decay
    const result15 = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 15 });
    expect(result15.nodes[0].confidence).toBe(0.8);
  });

  it('noder uppdaterade precis inom gränsen degraderas INTE', () => {
    let graph = createEmptyGraph();
    // 19 days ago is within the 20-day window
    graph = addNode(graph, makeNode({ id: 'boundary-1', confidence: 0.8, updated: makeOldDate(19) }));

    const result = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 20 });
    expect(result.nodes[0].confidence).toBe(0.8);
  });

  it('decay appliceras inte dubbelt (decay_applied check)', () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({
      id: 'already-decayed',
      confidence: 0.72,
      updated: makeOldDate(30),
      properties: { decay_applied: true },
    }));

    const result = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 20 });
    expect(result.nodes[0].confidence).toBe(0.72);
  });

  it('returnerar ny graf utan att mutera originalet', () => {
    let graph = createEmptyGraph();
    graph = addNode(graph, makeNode({ id: 'old-1', confidence: 0.8, updated: makeOldDate(30) }));

    const result = applyConfidenceDecay(graph);
    expect(result).not.toBe(graph);
    expect(graph.nodes[0].confidence).toBe(0.8);
  });
});
