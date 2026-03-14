import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadAuroraGraph = vi.fn();
const mockFindAuroraNodes = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  findAuroraNodes: (...args: unknown[]) => mockFindAuroraNodes(...args),
}));

import {
  libraryMetadataCommand,
  libraryMetadataCoverageCommand,
} from '../../src/commands/ebucore-metadata.js';

const mockGraph = {
  nodes: [
    {
      id: 'test-transcript',
      type: 'transcript',
      title: 'Test Video',
      properties: {
        duration: 120,
        language: 'sv',
        publishedDate: '2024-01-01',
        videoUrl: 'https://youtube.com/watch?v=abc',
        platform: 'youtube',
        segmentCount: 10,
      },
      confidence: 0.9,
      scope: 'personal',
      sourceUrl: 'https://youtube.com/watch?v=abc',
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'test-voice-print',
      type: 'voice_print',
      title: 'Speaker: Alice',
      properties: { speakerLabel: 'Alice', totalDurationMs: 50000, segmentCount: 5 },
      confidence: 0.7,
      scope: 'personal',
      sourceUrl: null,
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
    },
  ],
  edges: [],
  lastUpdated: '2024-01-01T00:00:00.000Z',
};

describe('libraryMetadataCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockFindAuroraNodes.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('outputs metadata for a valid transcript nodeId', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    await libraryMetadataCommand('test-transcript');

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Test Video');
    expect(output).toContain('ebucore:duration');
    expect(output).toContain('120');
    expect(output).toContain('EBUCore');
  });

  it('outputs standards info for transcript node', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    await libraryMetadataCommand('test-transcript');

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('EBUCore 1.10');
    expect(output).toContain('Dublin Core');
  });

  it('shows completeness status for a complete node', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    await libraryMetadataCommand('test-transcript');

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('complete');
  });

  it('outputs error for non-existent nodeId', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    await libraryMetadataCommand('does-not-exist');

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('not found');
    expect(output).toContain('does-not-exist');
  });

  it('outputs metadata for a voice_print node', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);

    await libraryMetadataCommand('test-voice-print');

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Alice');
    expect(output).toContain('ebucore:speakerName');
  });

  it('handles loadAuroraGraph failure gracefully', async () => {
    mockLoadAuroraGraph.mockRejectedValue(new Error('DB down'));

    await libraryMetadataCommand('test-transcript');

    const errorOutput = (console.error as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errorOutput).toContain('DB down');
  });
});

describe('libraryMetadataCoverageCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockLoadAuroraGraph.mockReset();
    mockFindAuroraNodes.mockReset();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('outputs coverage report for mixed nodes', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);
    mockFindAuroraNodes.mockReturnValue(mockGraph.nodes);

    await libraryMetadataCoverageCommand();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Total nodes');
    expect(output).toContain('2');
    expect(output).toContain('Coverage');
    expect(output).toContain('100%');
  });

  it('outputs per-type breakdown', async () => {
    mockLoadAuroraGraph.mockResolvedValue(mockGraph);
    mockFindAuroraNodes.mockReturnValue(mockGraph.nodes);

    await libraryMetadataCoverageCommand();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('transcript');
    expect(output).toContain('voice_print');
  });

  it('handles empty graph gracefully', async () => {
    const emptyGraph = { nodes: [], edges: [], lastUpdated: '2024-01-01T00:00:00.000Z' };
    mockLoadAuroraGraph.mockResolvedValue(emptyGraph);
    mockFindAuroraNodes.mockReturnValue([]);

    await libraryMetadataCoverageCommand();

    const output = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Total nodes');
    expect(output).toContain('0');
    expect(output).toContain('0%');
  });

  it('handles loadAuroraGraph failure gracefully', async () => {
    mockLoadAuroraGraph.mockRejectedValue(new Error('Connection refused'));

    await libraryMetadataCoverageCommand();

    const errorOutput = (console.error as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errorOutput).toContain('Connection refused');
  });
});
