import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraGraph, AuroraNode } from '../../src/aurora/aurora-schema.js';

// --- Mocks ---

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

vi.mock('../../src/core/embeddings.js', () => ({
  isEmbeddingAvailable: vi.fn().mockResolvedValue(false),
  getEmbeddingProvider: vi.fn(),
}));

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
vi.mock('../../src/aurora/aurora-graph.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/aurora/aurora-graph.js')
  >('../../src/aurora/aurora-graph.js');
  return {
    ...actual,
    loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
    saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  };
});

import {
  renameSpeaker,
  mergeSpeakers,
  suggestSpeakerMatches,
} from '../../src/aurora/voiceprint.js';

// --- Helpers ---

const now = new Date().toISOString();

function makeVoicePrint(
  id: string,
  label: string,
  videoNodeId: string,
  segments = 5,
  duration = 3000,
): AuroraNode {
  return {
    id,
    type: 'voice_print',
    title: `Speaker: ${label}`,
    properties: {
      speakerLabel: label,
      videoNodeId,
      segmentCount: segments,
      totalDurationMs: duration,
    },
    confidence: 0.7,
    scope: 'personal',
    created: now,
    updated: now,
  };
}

function makeGraph(
  nodes: AuroraNode[],
  edges: AuroraGraph['edges'] = [],
): AuroraGraph {
  return { nodes, edges, lastUpdated: now };
}

// --- Tests ---

describe('renameSpeaker', () => {
  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
  });

  it('updates speakerLabel and title', async () => {
    const vp = makeVoicePrint('vp-1', 'OldName', 'video-1');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp]));
    mockSaveAuroraGraph.mockResolvedValue(undefined);

    const result = await renameSpeaker('vp-1', 'NewName');

    expect(result.oldName).toBe('OldName');
    expect(result.newName).toBe('NewName');
    expect(result.voicePrintId).toBe('vp-1');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const updatedNode = savedGraph.nodes.find((n) => n.id === 'vp-1')!;
    expect(updatedNode.properties.speakerLabel).toBe('NewName');
    expect(updatedNode.title).toBe('Speaker: NewName');
  });

  it('throws on non-existent node', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));
    await expect(renameSpeaker('vp-missing', 'Name')).rejects.toThrow(
      'Voice print not found: vp-missing',
    );
  });

  it('throws on non-voice_print node', async () => {
    const factNode: AuroraNode = {
      id: 'fact-1',
      type: 'fact',
      title: 'Some fact',
      properties: {},
      confidence: 0.8,
      scope: 'personal',
      created: now,
      updated: now,
    };
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([factNode]));
    await expect(renameSpeaker('fact-1', 'Name')).rejects.toThrow(
      'Voice print not found: fact-1',
    );
  });
});

describe('mergeSpeakers', () => {
  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
  });

  it('transfers segments and removes source', async () => {
    const source = makeVoicePrint('vp-src', 'Alice', 'video-1', 5, 3000);
    const target = makeVoicePrint('vp-tgt', 'Bob', 'video-2', 10, 5000);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([source, target]));
    mockSaveAuroraGraph.mockResolvedValue(undefined);

    const result = await mergeSpeakers('vp-src', 'vp-tgt');

    expect(result.merged).toBe(true);
    expect(result.targetId).toBe('vp-tgt');
    expect(result.targetName).toBe('Bob');
    expect(result.sourceSegments).toBe(5);
    expect(result.totalSegments).toBe(15);

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    expect(savedGraph.nodes.find((n) => n.id === 'vp-src')).toBeUndefined();
    expect(savedGraph.nodes.find((n) => n.id === 'vp-tgt')).toBeDefined();
  });

  it('aggregates segmentCount and totalDurationMs', async () => {
    const source = makeVoicePrint('vp-src', 'Alice', 'video-1', 5, 3000);
    const target = makeVoicePrint('vp-tgt', 'Bob', 'video-2', 10, 5000);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([source, target]));
    mockSaveAuroraGraph.mockResolvedValue(undefined);

    await mergeSpeakers('vp-src', 'vp-tgt');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const merged = savedGraph.nodes.find((n) => n.id === 'vp-tgt')!;
    expect(merged.properties.segmentCount).toBe(15);
    expect(merged.properties.totalDurationMs).toBe(8000);
  });

  it('transfers edges from source to target', async () => {
    const source = makeVoicePrint('vp-src', 'Alice', 'video-1');
    const target = makeVoicePrint('vp-tgt', 'Bob', 'video-2');
    const other: AuroraNode = {
      id: 'node-x',
      type: 'document',
      title: 'Doc X',
      properties: {},
      confidence: 0.8,
      scope: 'personal',
      created: now,
      updated: now,
    };
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-src', to: 'node-x', type: 'related_to', metadata: {} },
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([source, target, other], edges));
    mockSaveAuroraGraph.mockResolvedValue(undefined);

    await mergeSpeakers('vp-src', 'vp-tgt');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const targetEdge = savedGraph.edges.find(
      (e) => e.from === 'vp-tgt' && e.to === 'node-x',
    );
    expect(targetEdge).toBeDefined();
    // Source node and its edges should be removed
    expect(
      savedGraph.edges.find((e) => e.from === 'vp-src' || e.to === 'vp-src'),
    ).toBeUndefined();
  });

  it('avoids duplicate edges', async () => {
    const source = makeVoicePrint('vp-src', 'Alice', 'video-1');
    const target = makeVoicePrint('vp-tgt', 'Bob', 'video-2');
    const other: AuroraNode = {
      id: 'node-x',
      type: 'document',
      title: 'Doc X',
      properties: {},
      confidence: 0.8,
      scope: 'personal',
      created: now,
      updated: now,
    };
    // Both source and target have an edge to node-x with the same type
    const edges: AuroraGraph['edges'] = [
      { from: 'vp-src', to: 'node-x', type: 'related_to', metadata: {} },
      { from: 'vp-tgt', to: 'node-x', type: 'related_to', metadata: {} },
    ];
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([source, target, other], edges));
    mockSaveAuroraGraph.mockResolvedValue(undefined);

    await mergeSpeakers('vp-src', 'vp-tgt');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const relatedEdges = savedGraph.edges.filter(
      (e) => e.from === 'vp-tgt' && e.to === 'node-x' && e.type === 'related_to',
    );
    expect(relatedEdges).toHaveLength(1);
  });

  it('throws on same source and target', async () => {
    await expect(mergeSpeakers('vp-1', 'vp-1')).rejects.toThrow(
      'Cannot merge a speaker with itself',
    );
  });

  it('throws on non-existent source', async () => {
    const target = makeVoicePrint('vp-tgt', 'Bob', 'video-2');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([target]));
    await expect(mergeSpeakers('vp-missing', 'vp-tgt')).rejects.toThrow(
      'Source voice print not found: vp-missing',
    );
  });

  it('throws on non-existent target', async () => {
    const source = makeVoicePrint('vp-src', 'Alice', 'video-1');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([source]));
    await expect(mergeSpeakers('vp-src', 'vp-missing')).rejects.toThrow(
      'Target voice print not found: vp-missing',
    );
  });
});

describe('suggestSpeakerMatches', () => {
  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockSaveAuroraGraph.mockReset();
  });

  it('finds same-name speakers across videos', async () => {
    const vp1 = makeVoicePrint('vp-1', 'Marcus', 'video-1');
    const vp2 = makeVoicePrint('vp-2', 'Marcus', 'video-2');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp1, vp2]));

    const matches = await suggestSpeakerMatches();

    expect(matches).toHaveLength(1);
    expect(matches[0].similarity).toBe(0.95);
    expect(matches[0].reason).toContain('Same name: Marcus');
  });

  it('treats auto-labels as weaker matches', async () => {
    const vp1 = makeVoicePrint('vp-1', 'SPEAKER_0', 'video-1');
    const vp2 = makeVoicePrint('vp-2', 'SPEAKER_0', 'video-2');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp1, vp2]));

    const matches = await suggestSpeakerMatches({ threshold: 0.3 });

    expect(matches).toHaveLength(1);
    expect(matches[0].similarity).toBe(0.5);
    expect(matches[0].reason).toContain('Same auto-label: SPEAKER_0');
  });

  it('respects threshold', async () => {
    const vp1 = makeVoicePrint('vp-1', 'Marcus', 'video-1');
    const vp2 = makeVoicePrint('vp-2', 'Marcus', 'video-2');
    const vp3 = makeVoicePrint('vp-3', 'SPEAKER_0', 'video-3');
    const vp4 = makeVoicePrint('vp-4', 'SPEAKER_0', 'video-4');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp1, vp2, vp3, vp4]));

    // Default threshold is 0.7, so SPEAKER_0 (0.5) should not appear
    const matches = await suggestSpeakerMatches();

    expect(matches).toHaveLength(1);
    expect(matches[0].sourceId).toBe('vp-1');
    expect(matches[0].matchId).toBe('vp-2');
  });

  it('filters by voicePrintId', async () => {
    const vp1 = makeVoicePrint('vp-1', 'Marcus', 'video-1');
    const vp2 = makeVoicePrint('vp-2', 'Marcus', 'video-2');
    const vp3 = makeVoicePrint('vp-3', 'Marcus', 'video-3');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp1, vp2, vp3]));

    const matches = await suggestSpeakerMatches({ voicePrintId: 'vp-1' });

    // Should only find matches for vp-1
    expect(matches.length).toBeGreaterThanOrEqual(1);
    for (const m of matches) {
      expect(m.sourceId).toBe('vp-1');
    }
  });

  it('returns empty for single voice print', async () => {
    const vp1 = makeVoicePrint('vp-1', 'Marcus', 'video-1');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp1]));

    const matches = await suggestSpeakerMatches();

    expect(matches).toEqual([]);
  });

  it('skips same-video matches', async () => {
    const vp1 = makeVoicePrint('vp-1', 'Marcus', 'video-1');
    const vp2 = makeVoicePrint('vp-2', 'Marcus', 'video-1'); // same video
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp1, vp2]));

    const matches = await suggestSpeakerMatches();

    expect(matches).toEqual([]);
  });

  it('avoids duplicate A-B pairs', async () => {
    const vp1 = makeVoicePrint('vp-1', 'Marcus', 'video-1');
    const vp2 = makeVoicePrint('vp-2', 'Marcus', 'video-2');
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([vp1, vp2]));

    const matches = await suggestSpeakerMatches();

    // Should only have one entry, not both A→B and B→A
    expect(matches).toHaveLength(1);
  });
});
