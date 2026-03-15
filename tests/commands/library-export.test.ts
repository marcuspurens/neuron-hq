import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuroraNode, AuroraGraph } from '../../src/aurora/aurora-schema.js';

// Mock jsonld-export module (used via dynamic import inside the command)
const mockNodeToJsonLd = vi.fn();
const mockOntologyToJsonLd = vi.fn();
const mockExportToFile = vi.fn();
vi.mock('../../src/aurora/jsonld-export.js', () => ({
  nodeToJsonLd: (...args: unknown[]) => mockNodeToJsonLd(...args),
  ontologyToJsonLd: (...args: unknown[]) => mockOntologyToJsonLd(...args),
  exportToFile: (...args: unknown[]) => mockExportToFile(...args),
  JSONLD_CONTEXT: { '@vocab': 'https://schema.org/' },
}));

// Mock aurora-graph module
const mockLoadAuroraGraph = vi.fn();
vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
}));

import { libraryExportCommand } from '../../src/commands/knowledge-library.js';

/** Helper to build a minimal AuroraNode for testing. */
function makeNode(overrides: Partial<AuroraNode> & { type: AuroraNode['type'] }): AuroraNode {
  return {
    id: overrides.id ?? 'test-node-1',
    type: overrides.type,
    title: overrides.title ?? 'Test Node',
    properties: overrides.properties ?? {},
    confidence: overrides.confidence ?? 0.9,
    scope: overrides.scope ?? 'personal',
    sourceUrl: overrides.sourceUrl ?? null,
    created: overrides.created ?? '2025-01-01T00:00:00.000Z',
    updated: overrides.updated ?? '2025-01-01T00:00:00.000Z',
  };
}

function makeGraph(nodes: AuroraNode[]): AuroraGraph {
  return { nodes, edges: [] };
}

describe('libraryExportCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  it('rejects non-jsonld format', async () => {
    await libraryExportCommand(undefined, { format: 'csv' });
    expect(console.error).toHaveBeenCalledWith('Only --format jsonld is supported currently.');
    expect(process.exitCode).toBe(1);
  });

  it('exports single node by ID', async () => {
    const node = makeNode({ id: 'abc-123', type: 'article', title: 'Test' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([node]));
    mockNodeToJsonLd.mockReturnValue({ '@id': 'abc-123' });

    await libraryExportCommand('abc-123', { format: 'jsonld' });

    expect(mockLoadAuroraGraph).toHaveBeenCalled();
    expect(mockNodeToJsonLd).toHaveBeenCalledWith(node);
    expect(console.log).toHaveBeenCalled();
  });

  it('reports error for missing node ID', async () => {
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    await libraryExportCommand('nonexistent', { format: 'jsonld' });

    expect(console.error).toHaveBeenCalledWith('Node not found: nonexistent');
    expect(process.exitCode).toBe(1);
  });

  it('exports ontology to stdout by default', async () => {
    mockOntologyToJsonLd.mockResolvedValue({ '@context': {}, '@graph': [] });

    await libraryExportCommand(undefined, { format: 'jsonld' });

    expect(mockOntologyToJsonLd).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  it('exports to file when --file is given', async () => {
    mockExportToFile.mockResolvedValue({ nodeCount: 5, edgeCount: 3, fileSize: 1024 });

    await libraryExportCommand(undefined, { format: 'jsonld', file: 'out.jsonld' });

    expect(mockExportToFile).toHaveBeenCalledWith('out.jsonld', 'ontology');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Exported 5 nodes'),
    );
  });

  it('exports articles scope', async () => {
    const articleNode = makeNode({ type: 'article', title: 'Article 1' });
    const conceptNode = makeNode({ id: 'c1', type: 'concept', title: 'Concept 1' });
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([articleNode, conceptNode]));
    mockNodeToJsonLd.mockReturnValue({ '@id': 'test' });

    await libraryExportCommand(undefined, { format: 'jsonld', scope: 'articles' });

    expect(mockLoadAuroraGraph).toHaveBeenCalled();
    // Should only map article nodes, not concept nodes
    expect(mockNodeToJsonLd).toHaveBeenCalledTimes(1);
    expect(mockNodeToJsonLd).toHaveBeenCalledWith(articleNode, { includeContext: false });
  });

  it('treats concepts scope as ontology alias', async () => {
    mockOntologyToJsonLd.mockResolvedValue({ '@context': {}, '@graph': [] });

    await libraryExportCommand(undefined, { format: 'jsonld', scope: 'concepts' });

    expect(mockOntologyToJsonLd).toHaveBeenCalled();
  });
});
