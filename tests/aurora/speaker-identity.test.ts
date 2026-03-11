import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

import type { AuroraNode, AuroraEdge, AuroraGraph } from '../../src/aurora/aurora-schema.js';

let mockGraph: AuroraGraph;

function createEmptyGraph(): AuroraGraph {
  return { nodes: [], edges: [], lastUpdated: new Date().toISOString() };
}

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: vi.fn(async () => mockGraph),
  saveAuroraGraph: vi.fn(async (g: AuroraGraph) => { mockGraph = g; }),
  addAuroraNode: vi.fn((graph: AuroraGraph, node: AuroraNode) => {
    if (graph.nodes.some(n => n.id === node.id)) throw new Error(`Duplicate node id: ${node.id}`);
    return { ...graph, nodes: [...graph.nodes, node], lastUpdated: new Date().toISOString() };
  }),
  addAuroraEdge: vi.fn((graph: AuroraGraph, edge: AuroraEdge) => {
    return { ...graph, edges: [...graph.edges, edge], lastUpdated: new Date().toISOString() };
  }),
  findAuroraNodes: vi.fn((graph: AuroraGraph, filter: { type?: string }) => {
    return graph.nodes.filter(n => !filter.type || n.type === filter.type);
  }),
  updateAuroraNode: vi.fn((graph: AuroraGraph, id: string, updates: Partial<AuroraNode>) => {
    const idx = graph.nodes.findIndex(n => n.id === id);
    if (idx === -1) throw new Error(`Node not found: ${id}`);
    const node = graph.nodes[idx];
    const updatedNode = {
      ...node,
      ...updates,
      properties: updates.properties ?? node.properties,
      confidence: updates.confidence ?? node.confidence,
      updated: new Date().toISOString(),
    };
    const nodes = [...graph.nodes];
    nodes[idx] = updatedNode;
    return { ...graph, nodes, lastUpdated: new Date().toISOString() };
  }),
}));

vi.mock('../../src/core/db.js', () => ({
  isDbAvailable: vi.fn().mockResolvedValue(false),
  getPool: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Imports (after mocks)                                              */
/* ------------------------------------------------------------------ */

import {
  createSpeakerIdentity,
  confirmSpeaker,
  rejectSpeakerSuggestion,
  listSpeakerIdentities,
  suggestIdentity,
  autoTagSpeakers,
} from '../../src/aurora/speaker-identity.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function addVoicePrint(id: string, label: string, videoNodeId: string = 'video-1'): void {
  const now = new Date().toISOString();
  mockGraph.nodes.push({
    id,
    type: 'voice_print',
    title: `Speaker: ${label}`,
    properties: { speakerLabel: label, videoNodeId },
    confidence: 0.7,
    scope: 'personal',
    sourceUrl: null,
    created: now,
    updated: now,
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('speaker-identity', () => {
  beforeEach(() => {
    mockGraph = createEmptyGraph();
  });

  it('createSpeakerIdentity creates node with base confidence', async () => {
    const identity = await createSpeakerIdentity('Marcus', 'vp-1');
    expect(identity.confidence).toBe(0.5);
    expect(identity.confirmations).toBe(1);
    expect(identity.confirmedVoicePrints).toContain('vp-1');
  });

  it('confirmSpeaker increases confidence correctly', async () => {
    await createSpeakerIdentity('Marcus', 'vp-1');
    const { newConfidence, identity } = await confirmSpeaker('speaker-marcus', 'vp-2');
    expect(newConfidence).toBe(0.6);
    expect(identity.confirmations).toBe(2);
  });

  it('confirmSpeaker formula: min(0.95, 0.5 + (n-1)*0.1)', async () => {
    await createSpeakerIdentity('Marcus', 'vp-1');
    for (let i = 2; i <= 6; i++) {
      await confirmSpeaker('speaker-marcus', `vp-${i}`);
    }
    const graph = mockGraph;
    const node = graph.nodes.find(n => n.id === 'speaker-marcus')!;
    expect(node.confidence).toBe(0.95);
  });

  it('confirmSpeaker adds voicePrintId to confirmedVoicePrints', async () => {
    await createSpeakerIdentity('Marcus', 'vp-1');
    const { identity } = await confirmSpeaker('speaker-marcus', 'vp-2');
    expect(identity.confirmedVoicePrints).toContain('vp-1');
    expect(identity.confirmedVoicePrints).toContain('vp-2');
  });

  it('confirmSpeaker does not duplicate voicePrintId', async () => {
    await createSpeakerIdentity('Marcus', 'vp-1');
    const { identity } = await confirmSpeaker('speaker-marcus', 'vp-1');
    expect(identity.confirmations).toBe(1);
    expect(identity.confirmedVoicePrints).toEqual(['vp-1']);
  });

  it('rejectSpeakerSuggestion stores rejection', async () => {
    await createSpeakerIdentity('Marcus', 'vp-1');
    await rejectSpeakerSuggestion('speaker-marcus', 'vp-2');
    const node = mockGraph.nodes.find(n => n.id === 'speaker-marcus')!;
    expect(node.properties.rejectedVoicePrints).toEqual(['vp-2']);
  });

  it('listSpeakerIdentities returns all speaker_identity nodes', async () => {
    await createSpeakerIdentity('Marcus', 'vp-1');
    await createSpeakerIdentity('Anna', 'vp-2');
    const list = await listSpeakerIdentities();
    expect(list).toHaveLength(2);
    // Both have same confidence 0.5, so order may vary; just check both present
    const names = list.map(i => i.name);
    expect(names).toContain('Marcus');
    expect(names).toContain('Anna');
  });

  it('suggestIdentity matches by name', async () => {
    addVoicePrint('vp-1', 'Marcus');
    await createSpeakerIdentity('Marcus', 'vp-1');
    const suggestions = await suggestIdentity('vp-1');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].reason).toContain('Name match');
  });

  it('suggestIdentity returns autoTagEligible when confidence >= threshold', async () => {
    addVoicePrint('vp-target', 'Marcus');
    await createSpeakerIdentity('Marcus', 'vp-0');
    for (let i = 1; i <= 5; i++) {
      await confirmSpeaker('speaker-marcus', `vp-extra-${i}`);
    }
    const suggestions = await suggestIdentity('vp-target');
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].autoTagEligible).toBe(true);
  });

  it('suggestIdentity returns empty for unknown speakers', async () => {
    addVoicePrint('vp-unknown', 'SPEAKER_0', 'video-99');
    await createSpeakerIdentity('Marcus', 'vp-other');
    const suggestions = await suggestIdentity('vp-unknown');
    expect(suggestions).toHaveLength(0);
  });

  it('autoTagSpeakers auto-tags when confidence >= 0.90', async () => {
    addVoicePrint('vp-tag', 'Marcus');
    await createSpeakerIdentity('Marcus', 'vp-0');
    for (let i = 1; i <= 5; i++) {
      await confirmSpeaker('speaker-marcus', `vp-c-${i}`);
    }
    const results = await autoTagSpeakers(['vp-tag']);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('auto_tagged');
  });

  it('autoTagSpeakers returns suggestion when confidence < 0.90', async () => {
    addVoicePrint('vp-tag', 'Marcus');
    await createSpeakerIdentity('Marcus', 'vp-0');
    const results = await autoTagSpeakers(['vp-tag']);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('suggestion');
  });

  it('autoTagSpeakers returns no_match for unknown speakers', async () => {
    addVoicePrint('vp-unknown', 'SPEAKER_0');
    const results = await autoTagSpeakers(['vp-unknown']);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('no_match');
  });

  it('autoTagSpeakers does not tag rejected matches', async () => {
    addVoicePrint('vp-rejected', 'Marcus');
    await createSpeakerIdentity('Marcus', 'vp-0');
    await rejectSpeakerSuggestion('speaker-marcus', 'vp-rejected');
    const results = await autoTagSpeakers(['vp-rejected']);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('no_match');
  });

  it('confidence never exceeds 0.95', async () => {
    await createSpeakerIdentity('Marcus', 'vp-1');
    for (let i = 2; i <= 11; i++) {
      await confirmSpeaker('speaker-marcus', `vp-${i}`);
    }
    const node = mockGraph.nodes.find(n => n.id === 'speaker-marcus')!;
    expect(node.confidence).toBe(0.95);
  });
});
