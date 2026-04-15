import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock gray-matter (not installed — obsidian-parser imports it).
// Provide a minimal implementation that splits YAML frontmatter and parses it.
vi.mock('gray-matter', async () => {
  const yaml = await import('js-yaml');
  return {
    default: (input: string) => {
      const match = input.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!match) return { data: {}, content: input };
      try {
        const data = yaml.load(match[1]) as Record<string, unknown>;
        return { data: data ?? {}, content: match[2] };
      } catch {
        throw new Error('Invalid YAML');
      }
    },
  };
});

const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();

function makeDirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

vi.mock('fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
}));

// Mock aurora-graph
const mockLoadAuroraGraph = vi.fn();
const mockUpdateAuroraNode = vi.fn();
const mockSaveAuroraGraph = vi.fn();

vi.mock('../../src/aurora/aurora-graph.js', () => ({
  loadAuroraGraph: (...args: unknown[]) => mockLoadAuroraGraph(...args),
  updateAuroraNode: (...args: unknown[]) => mockUpdateAuroraNode(...args),
  saveAuroraGraph: (...args: unknown[]) => mockSaveAuroraGraph(...args),
  findAuroraNodes: vi.fn().mockReturnValue([]),
}));

// Mock voiceprint
const mockRenameSpeaker = vi.fn();

vi.mock('../../src/aurora/voiceprint.js', () => ({
  renameSpeaker: (...args: unknown[]) => mockRenameSpeaker(...args),
}));

// Mock obsidian-parser (selective — use real parseObsidianFile for integration-like tests)
vi.mock('../../src/aurora/obsidian-parser.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/aurora/obsidian-parser.js')>(
    '../../src/aurora/obsidian-parser.js'
  );
  return {
    ...actual,
  };
});
vi.mock('../../src/commands/obsidian-export.js', () => ({
  isVideoTranscript: (node: { type?: string; properties?: { rawSegments?: unknown } }) => {
    return (
      node.type === 'transcript' &&
      Array.isArray((node.properties as Record<string, unknown>)?.rawSegments)
    );
  },
}));

import { obsidianImportCommand } from '../../src/commands/obsidian-import.js';

function makeGraph(nodes: Record<string, unknown>[] = []) {
  return {
    nodes: nodes.map((n) => ({
      id: 'node-1',
      type: 'transcript',
      title: 'Test',
      properties: {},
      confidence: 0.8,
      scope: 'personal',
      sourceUrl: null,
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      ...n,
    })),
    edges: [],
    lastUpdated: '2026-01-01T00:00:00.000Z',
  };
}

describe('obsidian-import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSaveAuroraGraph.mockResolvedValue(undefined);
    mockRenameSpeaker.mockResolvedValue({ oldName: '', newName: '', voicePrintId: '' });
  });

  it('prints error if vault directory does not exist', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));

    await obsidianImportCommand({ vault: '/nonexistent' });

    expect(console.error).toHaveBeenCalled();
    expect(mockLoadAuroraGraph).not.toHaveBeenCalled();
  });

  it('prints warning if no .md files found', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([]);

    await obsidianImportCommand({ vault: '/test-vault' });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No .md files'));
    expect(mockLoadAuroraGraph).not.toHaveBeenCalled();
  });

  it('processes a file with highlights and comments', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('test.md', false)]);

    const mdContent = [
      '---',
      'id: trans-1',
      'speakers:',
      '  SPEAKER_00:',
      '    name: "Alice"',
      '    confidence: 0.9',
      '    role: "host"',
      '---',
      '',
      '### 00:01:00 \u2014 SPEAKER_00 #highlight',
      'Some text here',
      '<!-- kommentar: Great point about AI -->',
      '',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'trans-1',
        type: 'transcript',
        properties: {
          rawSegments: [
            { start_ms: 59000, end_ms: 65000, text: 'Hello' },
            { start_ms: 120000, end_ms: 125000, text: 'World' },
          ],
        },
      },
      {
        id: 'vp-1',
        type: 'voice_print',
        title: 'Speaker: SPEAKER_00',
        properties: {
          videoNodeId: 'trans-1',
          speakerLabel: 'SPEAKER_00',
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);

    // updateAuroraNode should return a new graph with the update applied
    const updatedGraph = { ...graph };
    mockUpdateAuroraNode.mockReturnValue(updatedGraph);

    await obsidianImportCommand({ vault: '/test-vault' });

    // Should have loaded graph
    expect(mockLoadAuroraGraph).toHaveBeenCalledOnce();

    // Should have updated the node with highlights and comments
    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    expect(updateCall[1]).toBe('trans-1');
    const props = updateCall[2].properties;
    expect(props.highlights).toHaveLength(1);
    expect(props.highlights[0].tag).toBe('highlight');
    expect(props.comments).toHaveLength(1);
    expect(props.comments[0].text).toBe('Great point about AI');

    // Should have saved graph once
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();

    // Should have renamed speaker (SPEAKER_00 → Alice)
    expect(mockRenameSpeaker).toHaveBeenCalledWith('vp-1', 'Alice');
  });

  it('skips file when node not found in graph', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('test.md', false)]);

    const mdContent = ['---', 'id: nonexistent-node', '---', '', 'Some body text'].join('\n');

    mockReadFile.mockResolvedValue(mdContent);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    await obsidianImportCommand({ vault: '/test-vault' });

    // Should not call updateAuroraNode since node was not found
    expect(mockUpdateAuroraNode).not.toHaveBeenCalled();
    // Should still save graph (even if nothing changed)
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('is idempotent — running twice produces same result', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('test.md', false)]);

    const mdContent = [
      '---',
      'id: trans-1',
      '---',
      '',
      '### 00:00:30 — Speaker #key-insight',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    // Graph already has highlights from a previous run
    const graph = makeGraph([
      {
        id: 'trans-1',
        type: 'transcript',
        properties: {
          rawSegments: [{ start_ms: 30000, end_ms: 35000, text: 'Text' }],
          highlights: [{ segment_start_ms: 30000, tag: 'key-insight' }],
          comments: [],
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    await obsidianImportCommand({ vault: '/test-vault' });

    // Should replace (not append) highlights
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    const props = updateCall[2].properties;
    expect(props.highlights).toHaveLength(1);
    expect(props.highlights[0].tag).toBe('key-insight');
  });

  // --- New edge case tests ---

  it('imports tags and comments but skips speaker rename when no speakers block', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('no-speakers.md', false)]);

    const mdContent = [
      '---',
      'id: trans-2',
      '---',
      '',
      '### 00:00:30 \u2014 Speaker #quote',
      'Some quoted text',
      '<!-- kommentar: Notable quote -->',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'trans-2',
        type: 'transcript',
        properties: {
          rawSegments: [{ start_ms: 30000, end_ms: 35000, text: 'Quote' }],
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    await obsidianImportCommand({ vault: '/test-vault' });

    // Should update node with highlights and comments
    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    expect(updateCall[1]).toBe('trans-2');
    const props = updateCall[2].properties;
    expect(props.highlights).toHaveLength(1);
    expect(props.highlights[0].tag).toBe('quote');
    expect(props.comments).toHaveLength(1);
    expect(props.comments[0].text).toBe('Notable quote');

    // Should NOT call renameSpeaker (no speakers in frontmatter)
    expect(mockRenameSpeaker).not.toHaveBeenCalled();
  });

  it('skips file with corrupt frontmatter without crashing', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('corrupt.md', false)]);

    const mdContent = '---\n{{invalid yaml\n---\nBody text';
    mockReadFile.mockResolvedValue(mdContent);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    await obsidianImportCommand({ vault: '/test-vault' });

    // parseObsidianFile returns null → no graph updates
    expect(mockUpdateAuroraNode).not.toHaveBeenCalled();
    expect(mockRenameSpeaker).not.toHaveBeenCalled();
    // Graph is still saved (command completes normally)
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('silently ignores file without id in frontmatter', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('no-id.md', false)]);

    const mdContent = [
      '---',
      'type: transcript',
      'title: Some Title',
      '---',
      '',
      'Some body text',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);
    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    await obsidianImportCommand({ vault: '/test-vault' });

    // parseObsidianFile returns null → no graph updates
    expect(mockUpdateAuroraNode).not.toHaveBeenCalled();
    expect(mockRenameSpeaker).not.toHaveBeenCalled();
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('does not add highlight when timecode is >5s from any segment', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('far-timecode.md', false)]);

    const mdContent = [
      '---',
      'id: trans-3',
      '---',
      '',
      '### 01:00:00 \u2014 Speaker #highlight',
      'Text far from any segment',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'trans-3',
        type: 'transcript',
        properties: {
          rawSegments: [
            { start_ms: 1000, end_ms: 2000, text: 'Seg 1' },
            { start_ms: 2000, end_ms: 3000, text: 'Seg 2' },
          ],
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    await obsidianImportCommand({ vault: '/test-vault' });

    // Should still call updateAuroraNode but with empty highlights
    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    const props = updateCall[2].properties;
    expect(props.highlights).toHaveLength(0);
  });

  it('does not rename speaker when name already matches speakerLabel', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('already-renamed.md', false)]);

    const mdContent = [
      '---',
      'id: trans-4',
      'speakers:',
      '  SPEAKER_00:',
      '    name: "Alice"',
      '    confidence: 0.9',
      '    role: "host"',
      '---',
      '',
      '### 00:00:30 \u2014 Alice',
      'Some text',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'trans-4',
        type: 'transcript',
        properties: {
          rawSegments: [{ start_ms: 30000, end_ms: 35000, text: 'Text' }],
        },
      },
      {
        id: 'vp-2',
        type: 'voice_print',
        title: 'Speaker: Alice',
        properties: {
          videoNodeId: 'trans-4',
          speakerLabel: 'Alice',
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    await obsidianImportCommand({ vault: '/test-vault' });

    // Should NOT call renameSpeaker — name already matches speakerLabel
    expect(mockRenameSpeaker).not.toHaveBeenCalled();
  });

  it('does not rename speaker when name is empty string', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('empty-name.md', false)]);

    const mdContent = [
      '---',
      'id: trans-5',
      'speakers:',
      '  SPEAKER_00:',
      '    name: ""',
      '    confidence: 0.7',
      '    role: ""',
      '---',
      '',
      '### 00:00:10 \u2014 SPEAKER_00',
      'Some text',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'trans-5',
        type: 'transcript',
        properties: {
          rawSegments: [{ start_ms: 10000, end_ms: 15000, text: 'Text' }],
        },
      },
      {
        id: 'vp-3',
        type: 'voice_print',
        title: 'Speaker: SPEAKER_00',
        properties: {
          videoNodeId: 'trans-5',
          speakerLabel: 'SPEAKER_00',
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    await obsidianImportCommand({ vault: '/test-vault' });

    // Should NOT call renameSpeaker — empty name is skipped
    expect(mockRenameSpeaker).not.toHaveBeenCalled();
  });

  it('renames speaker when user edits the Label column directly', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('label-rename.md', false)]);

    // User changed Label column from SPEAKER_00 → Alice, left Namn empty
    const mdContent = [
      '---',
      'id: trans-6',
      '---',
      '',
      '## Talare',
      '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
      '|-------|------|-------|--------------|------|----------------|',
      '| Alice |      |       |              |      | 0.7            |',
      '',
      '#### 00:00:10 \u2014 Alice',
      'Some text',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'trans-6',
        type: 'transcript',
        properties: {
          rawSegments: [{ start_ms: 10000, end_ms: 15000, text: 'Text' }],
        },
      },
      {
        id: 'vp-4',
        type: 'voice_print',
        title: 'Speaker: SPEAKER_00',
        properties: {
          videoNodeId: 'trans-6',
          speakerLabel: 'SPEAKER_00',
          segments: [{ start_ms: 10000, end_ms: 15000 }],
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    await obsidianImportCommand({ vault: '/test-vault' });

    expect(mockRenameSpeaker).toHaveBeenCalledWith('vp-4', 'Alice');
  });

  it('processes multiple files in vault and saves graph once', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('file-a.md', false), makeDirent('file-b.md', false)]);

    const mdContentA = [
      '---',
      'id: trans-a',
      '---',
      '',
      '### 00:00:10 \u2014 Speaker #highlight',
      'Text A',
    ].join('\n');

    const mdContentB = [
      '---',
      'id: trans-b',
      '---',
      '',
      '### 00:00:20 \u2014 Speaker #quote',
      'Text B',
    ].join('\n');

    mockReadFile.mockResolvedValueOnce(mdContentA).mockResolvedValueOnce(mdContentB);

    const graph = makeGraph([
      {
        id: 'trans-a',
        type: 'transcript',
        properties: {
          rawSegments: [{ start_ms: 10000, end_ms: 15000, text: 'A' }],
        },
      },
      {
        id: 'trans-b',
        type: 'transcript',
        properties: {
          rawSegments: [{ start_ms: 20000, end_ms: 25000, text: 'B' }],
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockImplementation((g) => g);

    await obsidianImportCommand({ vault: '/test-vault' });

    // Both files should be processed
    expect(mockUpdateAuroraNode).toHaveBeenCalledTimes(2);

    // Verify first file update
    const firstCall = mockUpdateAuroraNode.mock.calls[0];
    expect(firstCall[1]).toBe('trans-a');
    expect(firstCall[2].properties.highlights).toHaveLength(1);
    expect(firstCall[2].properties.highlights[0].tag).toBe('highlight');

    // Verify second file update
    const secondCall = mockUpdateAuroraNode.mock.calls[1];
    expect(secondCall[1]).toBe('trans-b');
    expect(secondCall[2].properties.highlights).toHaveLength(1);
    expect(secondCall[2].properties.highlights[0].tag).toBe('quote');

    // Graph saved only once
    expect(mockSaveAuroraGraph).toHaveBeenCalledOnce();
  });

  it('AC7: imports text changes for non-video document nodes', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('doc.md', false)]);

    const mdContent = [
      '---',
      'id: doc-1',
      'exported_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# My Document',
      '',
      '## Innehåll',
      '',
      'Updated content from Obsidian',
      '',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'doc-1',
        type: 'document',
        title: 'My Document',
        updated: '2025-12-01T00:00:00.000Z',
        properties: {
          text: 'Original content',
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    const updatedGraph = { ...graph };
    mockUpdateAuroraNode.mockReturnValue(updatedGraph);

    const result = await obsidianImportCommand({ vault: '/test-vault' });

    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    expect(updateCall[2].properties.text).toBe('Updated content from Obsidian');
    expect(result.contentUpdates).toBe(1);
  });

  it('AC8: imports title changes for non-video document nodes', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('doc.md', false)]);

    const mdContent = [
      '---',
      'id: doc-2',
      'exported_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# New Title From Obsidian',
      '',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'doc-2',
        type: 'document',
        title: 'Old Title',
        updated: '2025-12-01T00:00:00.000Z',
        properties: {},
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    const updatedGraph = { ...graph };
    mockUpdateAuroraNode.mockReturnValue(updatedGraph);

    await obsidianImportCommand({ vault: '/test-vault' });

    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    expect(updateCall[2].title).toBe('New Title From Obsidian');
  });

  it('AC9: imports confidence changes for non-video document nodes', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('doc.md', false)]);

    const mdContent = [
      '---',
      'id: doc-3',
      'confidence: 0.9',
      'exported_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'doc-3',
        type: 'document',
        title: 'Doc Three',
        confidence: 0.5,
        updated: '2025-12-01T00:00:00.000Z',
        properties: {},
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    const updatedGraph = { ...graph };
    mockUpdateAuroraNode.mockReturnValue(updatedGraph);

    await obsidianImportCommand({ vault: '/test-vault' });

    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    expect(updateCall[2].confidence).toBe(0.9);
  });

  it('AC10: logs conflict warning when node.updated > exported_at (non-blocking)', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('doc.md', false)]);

    const mdContent = [
      '---',
      'id: doc-4',
      'exported_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'doc-4',
        type: 'document',
        title: 'Doc Four',
        updated: '2026-02-01T00:00:00.000Z', // AFTER exported_at — conflict!
        properties: {},
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    const updatedGraph = { ...graph };
    mockUpdateAuroraNode.mockReturnValue(updatedGraph);

    // Should not throw
    const result = await obsidianImportCommand({ vault: '/test-vault' });

    // Import should still succeed (non-blocking)
    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    expect(result.conflictWarnings).toBe(1);
  });

  it('imports tags from frontmatter back to node properties', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('tagged.md', false)]);

    const mdContent = [
      '---',
      'id: doc-tags',
      'tags:',
      '  - AI',
      '  - job displacement',
      '  - ethics',
      '---',
      '',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'doc-tags',
        type: 'document',
        title: 'Tagged Doc',
        updated: '2025-12-01T00:00:00.000Z',
        properties: { tags: ['AI', 'old-tag'] },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    const result = await obsidianImportCommand({ vault: '/test-vault' });

    expect(mockUpdateAuroraNode).toHaveBeenCalledOnce();
    const updateCall = mockUpdateAuroraNode.mock.calls[0];
    expect(updateCall[2].properties.tags).toEqual(['AI', 'job displacement', 'ethics']);
    expect(result.tagsUpdated).toBe(1);
  });

  it('does not count tagsUpdated when tags are unchanged', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('same-tags.md', false)]);

    const mdContent = ['---', 'id: doc-same-tags', 'tags:', '  - AI', '  - ethics', '---', ''].join(
      '\n'
    );

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'doc-same-tags',
        type: 'document',
        title: 'Same Tags Doc',
        updated: '2025-12-01T00:00:00.000Z',
        properties: { tags: ['AI', 'ethics'] },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockReturnValue(graph);

    const result = await obsidianImportCommand({ vault: '/test-vault' });

    expect(result.tagsUpdated).toBe(0);
  });

  it('reassigns segments when timeline speaker header is changed', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([makeDirent('video.md', false)]);

    const mdContent = [
      '---',
      'id: yt-seg-test',
      'type: transcript',
      'speakers:',
      '  SPEAKER_00:',
      '    name: ""',
      '    title: ""',
      '    organization: ""',
      '    confidence: 0.9',
      '    role: ""',
      '  SPEAKER_01:',
      '    name: ""',
      '    title: ""',
      '    organization: ""',
      '    confidence: 0.8',
      '    role: ""',
      '---',
      '',
      '## Tidslinje',
      '',
      '### 00:00:00 \u2014 SPEAKER_00',
      'Hello from speaker zero',
      '',
      '### 00:01:00 \u2014 SPEAKER_00',
      'This was reassigned from SPEAKER_01 to SPEAKER_00',
      '',
    ].join('\n');

    mockReadFile.mockResolvedValue(mdContent);

    const graph = makeGraph([
      {
        id: 'yt-seg-test',
        type: 'transcript',
        properties: {
          rawSegments: [
            { start_ms: 0, end_ms: 5000, text: 'Hello' },
            { start_ms: 60000, end_ms: 65000, text: 'Reassigned text' },
          ],
        },
      },
      {
        id: 'vp-seg-s00',
        type: 'voice_print',
        properties: {
          videoNodeId: 'yt-seg-test',
          speakerLabel: 'SPEAKER_00',
          segments: [{ start_ms: 0, end_ms: 5000 }],
        },
      },
      {
        id: 'vp-seg-s01',
        type: 'voice_print',
        properties: {
          videoNodeId: 'yt-seg-test',
          speakerLabel: 'SPEAKER_01',
          segments: [{ start_ms: 60000, end_ms: 65000 }],
        },
      },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockImplementation((g) => g);

    const result = await obsidianImportCommand({ vault: '/test-vault' });

    expect(result.segmentReassignments).toBe(1);

    const updateCalls = mockUpdateAuroraNode.mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('AC11: result includes contentUpdates and conflictWarnings counts', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });
    mockReaddir.mockResolvedValue([]);

    mockLoadAuroraGraph.mockResolvedValue(makeGraph([]));

    const result = await obsidianImportCommand({ vault: '/test-vault' });

    expect(result).toHaveProperty('contentUpdates');
    expect(result).toHaveProperty('conflictWarnings');
    expect(typeof result.contentUpdates).toBe('number');
    expect(typeof result.conflictWarnings).toBe('number');
  });

  it('recursively scans subdirectories under Aurora/', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true });

    mockReaddir.mockImplementation((dir: string) => {
      if (typeof dir === 'string' && dir.endsWith('/Aurora')) {
        return Promise.resolve([
          makeDirent('Video', true),
          makeDirent('Dokument', true),
          makeDirent('root-file.md', false),
        ]);
      }
      if (typeof dir === 'string' && dir.endsWith('/Video')) {
        return Promise.resolve([makeDirent('video-file.md', false)]);
      }
      if (typeof dir === 'string' && dir.endsWith('/Dokument')) {
        return Promise.resolve([makeDirent('doc-file.md', false)]);
      }
      return Promise.resolve([]);
    });

    const videoMd = ['---', 'id: vid-sub', '---', ''].join('\n');
    const docMd = ['---', 'id: doc-sub', '---', ''].join('\n');
    const rootMd = ['---', 'id: root-sub', '---', ''].join('\n');

    mockReadFile.mockImplementation((path: string) => {
      if (typeof path === 'string' && path.includes('video-file')) return Promise.resolve(videoMd);
      if (typeof path === 'string' && path.includes('doc-file')) return Promise.resolve(docMd);
      if (typeof path === 'string' && path.includes('root-file')) return Promise.resolve(rootMd);
      return Promise.reject(new Error('ENOENT'));
    });

    const graph = makeGraph([
      { id: 'vid-sub', type: 'transcript', properties: {} },
      { id: 'doc-sub', type: 'document', properties: {} },
      { id: 'root-sub', type: 'fact', properties: {} },
    ]);

    mockLoadAuroraGraph.mockResolvedValue(graph);
    mockUpdateAuroraNode.mockImplementation((g) => g);

    const result = await obsidianImportCommand({ vault: '/test-vault' });

    expect(result.filesProcessed).toBe(3);
    expect(mockUpdateAuroraNode).toHaveBeenCalledTimes(3);

    const updatedIds = mockUpdateAuroraNode.mock.calls.map(
      (args: unknown[]) => args[1] as string
    );
    expect(updatedIds).toContain('vid-sub');
    expect(updatedIds).toContain('doc-sub');
    expect(updatedIds).toContain('root-sub');
  });
});
