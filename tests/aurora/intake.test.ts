import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import type { AuroraGraph } from '../../src/aurora/aurora-schema.js';
import { PipelineError } from '../../src/aurora/pipeline-errors.js';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockRunWorker = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
}));

vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(true),
  getOllamaUrl: vi.fn().mockReturnValue('http://localhost:11434'),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    OLLAMA_MODEL_POLISH: 'gemma3',
    OLLAMA_URL: 'http://localhost:11434',
  }),
}));

const originalFetch = globalThis.fetch;
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockLoadAuroraGraph = vi.fn();
const mockSaveAuroraGraph = vi.fn();
const mockAutoEmbedAuroraNodes = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/aurora/aurora-graph.js')>(
    '../../src/aurora/aurora-graph.js'
  );
  return {
    ...actual,
    loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
    saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
    autoEmbedAuroraNodes: (...args: unknown[]) => mockAutoEmbedAuroraNodes(...args),
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
    (_, i) => `Sentence ${i + 1} provides important content about the topic.`
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
  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        message: {
          role: 'assistant',
          content:
            '{"tags": ["test-tag", "example"], "language": "english", "author": null, "content_type": "web article", "summary": "A test document."}',
        },
        done: true,
      }),
  } as unknown as Response);
});

/* ------------------------------------------------------------------ */
/*  Import after mocks are set up                                      */
/* ------------------------------------------------------------------ */

const { ingestUrl, ingestDocument } = await import('../../src/aurora/intake.js');

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

    // saveAuroraGraph called twice (initial save + pipeline report update)
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(2);

    // autoEmbedAuroraNodes called with [docId, ...chunkIds]
    expect(mockAutoEmbedAuroraNodes).toHaveBeenCalledTimes(1);
    const embedArg = mockAutoEmbedAuroraNodes.mock.calls[0][0] as string[];
    expect(embedArg[0]).toBe(result.documentNodeId);
    expect(embedArg.slice(1)).toEqual(result.chunkNodeIds);

    // Inspect the graph passed to first saveAuroraGraph call
    const savedGraph = mockSaveAuroraGraph.mock.calls[0][0] as AuroraGraph;

    // Should have doc node + chunk nodes
    const docNode = savedGraph.nodes.find((n) => n.id === result.documentNodeId);
    expect(docNode).toBeDefined();
    expect(docNode!.title).toBe(title);
    expect(docNode!.type).toBe('document');

    // Chunk nodes should exist
    for (const chunkId of result.chunkNodeIds) {
      const chunkNode = savedGraph.nodes.find((n) => n.id === chunkId);
      expect(chunkNode).toBeDefined();
    }

    // derived_from edges from each chunk to the doc
    const derivedEdges = savedGraph.edges.filter((e) => e.type === 'derived_from');
    expect(derivedEdges.length).toBe(result.chunkNodeIds.length);
    for (const edge of derivedEdges) {
      expect(edge.to).toBe(result.documentNodeId);
      expect(edge.metadata.createdBy).toBe('intake-pipeline');
    }
  });

  it('throws PipelineError on worker error', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'Network timeout',
    });

    await expect(ingestUrl('https://bad.example.com')).rejects.toThrow(PipelineError);
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
      source: expect.stringContaining('notes.txt'),
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
      source: expect.stringContaining('readme.md'),
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
      source: expect.stringContaining('doc.markdown'),
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
      source: expect.stringContaining('doc.pdf'),
    });
  });

  it('rejects unsupported file type', async () => {
    await expect(ingestDocument('image.png')).rejects.toThrow('Unsupported file type');
  });

  it('throws on worker error', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'File not found',
    });

    await expect(ingestDocument('missing.txt')).rejects.toThrow('File not found');
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
    // saveAuroraGraph called twice: initial save + pipeline report update
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(2);

    // Capture the last saved graph (with report) and use it for the next call
    const savedGraph = mockSaveAuroraGraph.mock.calls[1][0] as AuroraGraph;
    mockLoadAuroraGraph.mockResolvedValue(savedGraph);

    // Second call — same text, graph already has the doc node
    const result2 = await ingestUrl('https://example.com');

    // Same document node ID
    expect(result2.documentNodeId).toBe(result1.documentNodeId);

    // saveAuroraGraph should NOT have been called again (dedup short-circuit)
    expect(mockSaveAuroraGraph).toHaveBeenCalledTimes(2);
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
    const docNode = savedGraph.nodes.find((n) => n.id === result.documentNodeId);
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
/*  9. Worker error → throws PipelineError for ingestUrl               */
/* ------------------------------------------------------------------ */

describe('worker error handling', () => {
  it('ingestUrl throws PipelineError with Swedish message from worker', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'Network timeout',
    });

    await expect(ingestUrl('https://example.com/fail')).rejects.toThrow(PipelineError);
  });

  it('ingestDocument throws with clear error message from worker', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'PDF corrupted',
    });

    await expect(ingestDocument('broken.pdf')).rejects.toThrow('PDF corrupted');
  });
});

/* ------------------------------------------------------------------ */
/*  10. Short text → single chunk                                      */
/* ------------------------------------------------------------------ */

describe('short text handling', () => {
  it('short text produces single chunk', async () => {
    // ~50 words — not enough for multiple chunks with default maxWords=200
    const shortText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');

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
    const docNode = savedGraph.nodes.find((n) => n.id === result.documentNodeId);
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
    const docNode = savedGraph.nodes.find((n) => n.id === result.documentNodeId);
    expect(docNode?.sourceUrl).toBe('https://example.com/source');
  });
});

/* ------------------------------------------------------------------ */
/*  PipelineError handling                                             */
/* ------------------------------------------------------------------ */

describe('PipelineError handling', () => {
  it('throws PipelineError with Swedish message when extract_url fails', async () => {
    mockRunWorker.mockResolvedValueOnce({
      ok: false,
      error: 'Connection timeout',
      title: '',
      text: '',
      metadata: {},
    });
    try {
      await ingestUrl('https://example.com/broken');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PipelineError);
      expect((err as PipelineError).step).toBe('extract_url');
      expect((err as PipelineError).userMessage).toContain('kunde inte hämtas');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Pipeline report                                                    */
/* ------------------------------------------------------------------ */

describe('Pipeline report', () => {
  it('includes pipeline_report in successful result', async () => {
    const longText = generateText(50);
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Test Article',
      text: longText,
      metadata: { source_type: 'url', word_count: longText.split(/\s+/).length },
    });
    const result = await ingestUrl('https://example.com/article');
    expect(result.pipeline_report).toBeDefined();
    expect(result.pipeline_report!.details.extract?.status).toBe('ok');
    expect(result.pipeline_report!.details.chunk?.status).toBe('ok');
  });

  it('saves pipeline_report on document node properties', async () => {
    const longText = generateText(50);
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Report Article',
      text: longText,
      metadata: { source_type: 'url' },
    });
    await ingestUrl('https://example.com/with-report');
    // Check that saveAuroraGraph was called and the graph has pipeline_report
    // The second save call contains the updated graph with the report
    const savedGraph = mockSaveAuroraGraph.mock.calls[1]?.[0] as AuroraGraph;
    expect(savedGraph).toBeDefined();
    const docNode = savedGraph.nodes.find((n: { id: string }) => n.id.startsWith('doc_'));
    expect(docNode?.properties?.pipeline_report).toBeDefined();
    expect(docNode.properties.pipeline_report.details.extract?.status).toBe('ok');
  });
});
