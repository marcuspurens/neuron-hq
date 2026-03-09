import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import type { AuroraGraph } from '../../src/aurora/aurora-schema.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockRunWorker = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
}));

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAutoEmbedAuroraNodes = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/aurora/aurora-graph.js')
  >('../../src/aurora/aurora-graph.js');
  return {
    ...actual,
    loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
    saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
    autoEmbedAuroraNodes: (...args: unknown[]) =>
      mockAutoEmbedAuroraNodes(...args),
  };
});

// Prevent real DB connections
vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn(),
  isDbAvailable: vi.fn().mockResolvedValue(false),
  closePool: vi.fn(),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyGraph(): AuroraGraph {
  return {
    nodes: [],
    edges: [],
    lastUpdated: new Date().toISOString(),
  };
}

function makeHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** Generate text with approximately `n` words. */
function generateText(n: number): string {
  return Array.from(
    { length: n },
    (_, i) => `Sentence ${i + 1} provides important content about the topic.`,
  ).join(' ');
}

const SAMPLE_TEXT = 'Hello world. This is a test document with enough words.';
const SAMPLE_TITLE = 'Test Document';
const SAMPLE_METADATA = { source_type: 'url', word_count: 10 };

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadAuroraGraph.mockResolvedValue(emptyGraph());
  mockSaveAuroraGraph.mockResolvedValue(undefined);
  mockAutoEmbedAuroraNodes.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/*  Import after mocks are set up                                      */
/* ------------------------------------------------------------------ */

const { ingestUrl, ingestDocument } = await import(
  '../../src/aurora/intake.js'
);

/* ------------------------------------------------------------------ */
/*  1. ingestUrl creates doc node + chunks + edges                     */
/* ------------------------------------------------------------------ */

describe('ingestUrl', () => {
  it('creates document node + chunk nodes + derived_from edges', async () => {
    const longText = generateText(50); // ~500 words
    const title = 'Article Title';
    mockRunWorker.mockResolvedValue({
      ok: true,
      title,
      text: longText,
      metadata: { source_type: 'url', word_count: longText.split(/\s+/).length },
    });

    const result = await ingestUrl('https://example.com/article');

    // Result assertions
    expect(result.documentNodeId).toMatch(/^doc_/);
    expect(result.chunkNodeIds.length).toBeGreaterThan(0);
    expect(result.title).toBe(title);
    expect(result.chunkCount).toBe(result.chunkNodeIds.length);

    // saveAuroraGraph called once
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(1);

    // autoEmbedAuroraNodes called with [docId, ...chunkIds]
    expect(mockAutoEmbedAuroraNodes).toHaveBeenCalledTimes(1);
    const embedArg = mockAutoEmbedAuroraNodes.mock.calls[0][0] as string[];
    expect(embedArg[0]).toBe(result.documentNodeId);
    expect(embedArg.slice(1)).toEqual(result.chunkNodeIds);

    // Inspect the graph passed to saveAuroraGraph
    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;

    // Should have doc node + chunk nodes
    const docNode = savedGraph.nodes.find(
      (n) => n.id === result.documentNodeId,
    );
    expect(docNode).toBeDefined();
    expect(docNode!.title).toBe(title);
    expect(docNode!.type).toBe('document');

    // Chunk nodes should exist
    for (const chunkId of result.chunkNodeIds) {
      const chunkNode = savedGraph.nodes.find((n) => n.id === chunkId);
      expect(chunkNode).toBeDefined();
    }

    // derived_from edges from each chunk to the doc
    const derivedEdges = savedGraph.edges.filter(
      (e) => e.type === 'derived_from',
    );
    expect(derivedEdges.length).toBe(result.chunkNodeIds.length);
    for (const edge of derivedEdges) {
      expect(edge.to).toBe(result.documentNodeId);
      expect(edge.metadata.createdBy).toBe('intake-pipeline');
    }
  });

  it('throws on worker error with clear message', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'Network timeout',
    });

    await expect(ingestUrl('https://bad.example.com')).rejects.toThrow(
      'Network timeout',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  2–5. ingestDocument file type detection                            */
/* ------------------------------------------------------------------ */

describe('ingestDocument', () => {
  it('detects .txt correctly', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'notes',
      text: SAMPLE_TEXT,
      metadata: { source_type: 'text', word_count: 10 },
    });

    await ingestDocument('notes.txt');

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'extract_text',
      source: 'notes.txt',
    });
  });

  it('detects .md correctly', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'readme',
      text: SAMPLE_TEXT,
      metadata: { source_type: 'text', word_count: 10 },
    });

    await ingestDocument('readme.md');

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'extract_text',
      source: 'readme.md',
    });
  });

  it('detects .markdown correctly', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'doc',
      text: SAMPLE_TEXT,
      metadata: { source_type: 'text', word_count: 10 },
    });

    await ingestDocument('doc.markdown');

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'extract_text',
      source: 'doc.markdown',
    });
  });

  it('detects .pdf correctly', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'report',
      text: SAMPLE_TEXT,
      metadata: { source_type: 'pdf', word_count: 10, page_count: 1 },
    });

    await ingestDocument('doc.pdf');

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'extract_pdf',
      source: 'doc.pdf',
    });
  });

  it('rejects unsupported file type', async () => {
    await expect(ingestDocument('image.png')).rejects.toThrow(
      'Unsupported file type',
    );
  });

  it('throws on worker error', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'File not found',
    });

    await expect(ingestDocument('missing.txt')).rejects.toThrow(
      'File not found',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  6. Deduplication                                                   */
/* ------------------------------------------------------------------ */

describe('deduplication', () => {
  it('same text returns same node ID, no duplicate save', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: SAMPLE_TITLE,
      text: SAMPLE_TEXT,
      metadata: SAMPLE_METADATA,
    });

    // First call — graph starts empty
    const result1 = await ingestUrl('https://example.com');
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(1);

    // Capture the saved graph and use it as the loaded graph for the next call
    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    mockLoadAuroraGraph.mockResolvedValue(savedGraph);

    // Second call — same text, graph already has the doc node
    const result2 = await ingestUrl('https://example.com');

    // Same document node ID
    expect(result2.documentNodeId).toBe(result1.documentNodeId);

    // saveAuroraGraph should NOT have been called again (dedup short-circuit)
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/*  7. scope and type parameters propagate                             */
/* ------------------------------------------------------------------ */

describe('options', () => {
  it('scope and type propagate to all nodes', async () => {
    const longText = generateText(50); // enough for chunks
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Research Paper',
      text: longText,
      metadata: { source_type: 'url', word_count: longText.split(/\s+/).length },
    });

    const result = await ingestUrl('https://example.com/paper', {
      scope: 'shared',
      type: 'research',
    });

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;

    // All nodes (doc + chunks) should have shared scope and research type
    for (const node of savedGraph.nodes) {
      expect(node.scope).toBe('shared');
      expect(node.type).toBe('research');
    }

    // Double-check the doc node specifically
    const docNode = savedGraph.nodes.find(
      (n) => n.id === result.documentNodeId,
    );
    expect(docNode?.scope).toBe('shared');
    expect(docNode?.type).toBe('research');
  });

  /* ---------------------------------------------------------------- */
  /*  8. maxChunks limits number of chunks                             */
  /* ---------------------------------------------------------------- */

  it('maxChunks limits number of chunks', async () => {
    // Generate ~5000 words to force many chunks
    const veryLongText = generateText(500);
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Very Long Doc',
      text: veryLongText,
      metadata: {
        source_type: 'url',
        word_count: veryLongText.split(/\s+/).length,
      },
    });

    const result = await ingestUrl('https://example.com/long', {
      maxChunks: 3,
    });

    expect(result.chunkCount).toBeLessThanOrEqual(3);
    expect(result.chunkNodeIds.length).toBeLessThanOrEqual(3);
  });
});

/* ------------------------------------------------------------------ */
/*  9. Worker error → throws (covered above, extra test here)          */
/* ------------------------------------------------------------------ */

describe('worker error handling', () => {
  it('ingestUrl throws with clear error message from worker', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'Network timeout',
    });

    await expect(
      ingestUrl('https://example.com/fail'),
    ).rejects.toThrow('Network timeout');
  });

  it('ingestDocument throws with clear error message from worker', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'PDF corrupted',
    });

    await expect(ingestDocument('broken.pdf')).rejects.toThrow(
      'PDF corrupted',
    );
  });
});

/* ------------------------------------------------------------------ */
/*  10. Short text → single chunk                                      */
/* ------------------------------------------------------------------ */

describe('short text handling', () => {
  it('short text produces single chunk', async () => {
    // ~50 words — not enough for multiple chunks with default maxWords=200
    const shortText = Array.from(
      { length: 50 },
      (_, i) => `word${i}`,
    ).join(' ');

    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Short Note',
      text: shortText,
      metadata: { source_type: 'url', word_count: 50 },
    });

    const result = await ingestUrl('https://example.com/short');

    expect(result.chunkCount).toBe(1);
    expect(result.chunkNodeIds.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Graph structure                                                    */
/* ------------------------------------------------------------------ */

describe('graph structure', () => {
  it('stores text summary (first 500 chars) in document node', async () => {
    const longText = 'A'.repeat(1000);
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Summary Test',
      text: longText,
      metadata: { source_type: 'text', word_count: 1 },
    });

    const result = await ingestDocument('summary.txt');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const docNode = savedGraph.nodes.find(
      (n) => n.id === result.documentNodeId,
    );
    expect((docNode?.properties.text as string).length).toBe(500);
  });

  it('sourceUrl is set for URL ingestion', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'With Source',
      text: SAMPLE_TEXT,
      metadata: SAMPLE_METADATA,
    });

    const result = await ingestUrl('https://example.com/source');

    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;
    const docNode = savedGraph.nodes.find(
      (n) => n.id === result.documentNodeId,
    );
    expect(docNode?.sourceUrl).toBe('https://example.com/source');
  });
});
