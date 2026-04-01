import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track fs calls
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockRm = vi.fn();
const mockReaddir = vi.fn();

vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}));

const mockQuery = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
}));

import { obsidianExportCommand } from '../../src/commands/obsidian-export.js';

// Helper: build a minimal AuroraNode row
function makeNode(overrides: Record<string, unknown>) {
  return {
    id: 'node-1',
    title: 'Test Node',
    type: 'document',
    scope: 'personal',
    confidence: 0.8,
    created: '2026-01-01',
    properties: {},
    ...overrides,
  };
}

describe('obsidian-export', () => {
  let writtenFiles: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    writtenFiles = new Map();
    mockWriteFile.mockImplementation((path: string, content: string) => {
      writtenFiles.set(path, content);
      return Promise.resolve();
    });
    mockMkdir.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('exports non-video node unchanged (no timeline, has normal text)', async () => {
    const docNode = makeNode({
      id: 'doc-1',
      title: 'My Document',
      type: 'document',
      properties: { text: 'Hello world content' },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [docNode] }) // nodes query
      .mockResolvedValueOnce({ rows: [] }); // edges query

    await obsidianExportCommand({ vault: '/tmp/vault' });

    expect(writtenFiles.size).toBe(1);
    const content = [...writtenFiles.values()][0];

    // Should have standard frontmatter
    expect(content).toContain('type: document');
    expect(content).toContain('scope: personal');
    // Should have text section
    expect(content).toContain('## Innehåll');
    expect(content).toContain('Hello world content');
    // Should NOT have timeline sections
    expect(content).not.toContain('## Tidslinje');
    expect(content).not.toContain('## Talare');
  });

  it('exports video transcript with rawSegments + voice_prints as timeline', async () => {
    const transcriptNode = makeNode({
      id: 'yt-abc123',
      title: 'Test Video Transcript',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 120,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'Hello from speaker zero' },
          { start_ms: 5000, end_ms: 10000, text: 'Now speaker one talks' },
        ],
      },
    });

    const voicePrint0 = makeNode({
      id: 'vp-yt-abc123-SPEAKER_00',
      title: 'Speaker: SPEAKER_00',
      type: 'voice_print',
      confidence: 0.7,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-abc123',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    const voicePrint1 = makeNode({
      id: 'vp-yt-abc123-SPEAKER_01',
      title: 'Speaker: SPEAKER_01',
      type: 'voice_print',
      confidence: 0.6,
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'yt-abc123',
        segments: [{ start_ms: 5000, end_ms: 10000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({
        rows: [transcriptNode, voicePrint0, voicePrint1],
      })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    // voice_print nodes are not transcript — they export normally; transcript gets timeline
    const transcriptContent = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Test Video Transcript')
    )?.[1];

    expect(transcriptContent).toBeDefined();

    // Speaker table
    expect(transcriptContent).toContain('## Talare');
    expect(transcriptContent).toContain('| SPEAKER_00 |');
    expect(transcriptContent).toContain('_ej identifierad_');

    // Timeline section
    expect(transcriptContent).toContain('## Tidslinje');
    expect(transcriptContent).toContain('00:00:00');
    expect(transcriptContent).toContain('Hello from speaker zero');
    expect(transcriptContent).toContain('Now speaker one talks');

    // Should NOT have standard text section
    expect(transcriptContent).not.toContain('## Innehåll');
  });

  it('skips chunk nodes for video transcripts with rawSegments', async () => {
    const transcriptNode = makeNode({
      id: 'yt-abc123',
      title: 'Test Video',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 60,
        rawSegments: [{ start_ms: 0, end_ms: 3000, text: 'Some text' }],
      },
    });

    const chunkNode = makeNode({
      id: 'yt-abc123_chunk_0',
      title: 'Test Video [chunk 1/1]',
      type: 'transcript',
      properties: { text: 'Chunk content' },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, chunkNode] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    // Only 1 file should be written (transcript), not the chunk
    expect(writtenFiles.size).toBe(1);
    const paths = [...writtenFiles.keys()];
    expect(paths.some((p) => p.includes('chunk'))).toBe(false);
  });

  it('frontmatter contains duration in hh:mm:ss format and speakers map', async () => {
    const transcriptNode = makeNode({
      id: 'yt-vid1',
      title: 'Duration Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 3723, // 1h 2m 3s
        rawSegments: [{ start_ms: 0, end_ms: 1000, text: 'Hello' }],
      },
    });

    const voicePrint = makeNode({
      id: 'vp-yt-vid1-SPEAKER_00',
      title: 'Speaker: SPEAKER_00',
      type: 'voice_print',
      confidence: 0.85,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-vid1',
        segments: [{ start_ms: 0, end_ms: 1000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, voicePrint] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Duration Test')
    )?.[1];

    expect(content).toBeDefined();

    // Frontmatter checks
    expect(content).toContain('duration: "01:02:03"');
    expect(content).toContain('speakers:');
    expect(content).toContain('SPEAKER_00:');
    expect(content).toContain('name: ""');
    expect(content).toContain('confidence: 0.85');
    expect(content).toContain('role: ""');
  });

  it('excludes chunk nodes for non-video document nodes', async () => {
    const parentNode = makeNode({
      id: 'doc-1',
      title: 'Some Document',
      type: 'document',
      properties: { text: 'Full text' },
    });

    const chunkNode = makeNode({
      id: 'doc-1_chunk_0',
      title: 'Some Document',
      type: 'document',
      properties: { text: 'Chunk text here' },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [parentNode, chunkNode] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    expect(writtenFiles.size).toBe(1);
    const hasChunkFile = [...writtenFiles.keys()].some((p) => p.includes('chunk'));
    expect(hasChunkFile).toBe(false);
  });

  // ---- Highlight & Comment annotation tests ----

  it('renders highlights as Obsidian callouts in timeline', async () => {
    // Use two different speakers so buildSpeakerTimeline creates separate blocks
    const transcriptNode = makeNode({
      id: 'yt-highlight1',
      title: 'Highlight Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 20,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'First segment text' },
          { start_ms: 5000, end_ms: 10000, text: 'Second segment text' },
          { start_ms: 10000, end_ms: 15000, text: 'Third segment text' },
        ],
        highlights: [{ segment_start_ms: 5500, tag: 'highlight' }],
      },
    });

    // Two speakers so segments don't get merged
    const voicePrint0 = makeNode({
      id: 'vp-yt-highlight1-SPEAKER_00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-highlight1',
        segments: [
          { start_ms: 0, end_ms: 5000 },
          { start_ms: 10000, end_ms: 15000 },
        ],
      },
    });

    const voicePrint1 = makeNode({
      id: 'vp-yt-highlight1-SPEAKER_01',
      type: 'voice_print',
      confidence: 0.8,
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'yt-highlight1',
        segments: [{ start_ms: 5000, end_ms: 10000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, voicePrint0, voicePrint1] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Highlight Test')
    )?.[1];

    expect(content).toBeDefined();

    // The second block (5000-10000ms, SPEAKER_01) should be a callout
    expect(content).toContain('> [!important] #highlight');
    expect(content).toContain('> Second segment text');

    // First and third blocks should NOT be callouts
    expect(content).toContain('First segment text');
    expect(content).toContain('Third segment text');
    expect(content).not.toContain('> First segment text');
    expect(content).not.toContain('> Third segment text');
  });

  it('renders comments as HTML comments after timeline blocks', async () => {
    const transcriptNode = makeNode({
      id: 'yt-comment1',
      title: 'Comment Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 15,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'First part' },
          { start_ms: 5000, end_ms: 10000, text: 'Second part' },
        ],
        comments: [{ segment_start_ms: 1000, text: 'Intressant poäng' }],
      },
    });

    // Two speakers so we get two blocks
    const voicePrint0 = makeNode({
      id: 'vp-yt-comment1-SPEAKER_00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-comment1',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    const voicePrint1 = makeNode({
      id: 'vp-yt-comment1-SPEAKER_01',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'yt-comment1',
        segments: [{ start_ms: 5000, end_ms: 10000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, voicePrint0, voicePrint1] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Comment Test')
    )?.[1];

    expect(content).toBeDefined();
    expect(content).toContain('<!-- kommentar: Intressant poäng -->');
    // Comment should appear after 'First part'
    const firstPartIdx = content!.indexOf('First part');
    const commentIdx = content!.indexOf('<!-- kommentar:');
    expect(commentIdx).toBeGreaterThan(firstPartIdx);
    // Comment should NOT appear after 'Second part'
    const secondPartIdx = content!.indexOf('Second part');
    expect(commentIdx).toBeLessThan(secondPartIdx);
  });

  it('renders both highlights and comments on the same block', async () => {
    const transcriptNode = makeNode({
      id: 'yt-both1',
      title: 'Both Annotations Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 10,
        rawSegments: [{ start_ms: 0, end_ms: 5000, text: 'Important statement' }],
        highlights: [{ segment_start_ms: 1000, tag: 'key-insight' }],
        comments: [{ segment_start_ms: 2000, text: 'Nyckelinsikt' }],
      },
    });

    const voicePrint = makeNode({
      id: 'vp-yt-both1-SPEAKER_00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-both1',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, voicePrint] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Both Annotations Test')
    )?.[1];

    expect(content).toBeDefined();
    // Should have highlight callout
    expect(content).toContain('> [!important] #key-insight');
    expect(content).toContain('> Important statement');
    // Should also have comment
    expect(content).toContain('<!-- kommentar: Nyckelinsikt -->');
  });

  it('output is identical when highlights and comments are empty arrays', async () => {
    const transcriptNode = makeNode({
      id: 'yt-empty1',
      title: 'Empty Annotations Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 10,
        rawSegments: [{ start_ms: 0, end_ms: 5000, text: 'Normal text here' }],
        highlights: [],
        comments: [],
      },
    });

    const voicePrint = makeNode({
      id: 'vp-yt-empty1-SPEAKER_00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-empty1',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, voicePrint] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Empty Annotations Test')
    )?.[1];

    expect(content).toBeDefined();
    // Should have normal timeline, no callouts or comments
    expect(content).toContain('## Tidslinje');
    expect(content).toContain('Normal text here');
    expect(content).not.toContain('> [!important]');
    expect(content).not.toContain('<!-- kommentar:');
  });

  // ---- Round-trip & edge case tests ----

  it('round-trip: no duplicate callouts on re-export', async () => {
    const transcriptNode = makeNode({
      id: 'yt-roundtrip1',
      title: 'Roundtrip Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 20,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'First highlighted part' },
          { start_ms: 5000, end_ms: 10000, text: 'Second highlighted part' },
          { start_ms: 10000, end_ms: 15000, text: 'Non highlighted part' },
        ],
        highlights: [
          { segment_start_ms: 1000, tag: 'insight' },
          { segment_start_ms: 6000, tag: 'key-point' },
        ],
        comments: [{ segment_start_ms: 2000, text: 'Kommentar A' }],
      },
    });

    // Three speakers so each segment stays as its own block
    const vp0 = makeNode({
      id: 'vp-yt-roundtrip1-S00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-roundtrip1',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    const vp1 = makeNode({
      id: 'vp-yt-roundtrip1-S01',
      type: 'voice_print',
      confidence: 0.8,
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'yt-roundtrip1',
        segments: [{ start_ms: 5000, end_ms: 10000 }],
      },
    });

    const vp2 = makeNode({
      id: 'vp-yt-roundtrip1-S02',
      type: 'voice_print',
      confidence: 0.7,
      properties: {
        speakerLabel: 'SPEAKER_02',
        videoNodeId: 'yt-roundtrip1',
        segments: [{ start_ms: 10000, end_ms: 15000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, vp0, vp1, vp2] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Roundtrip Test')
    )?.[1];

    expect(content).toBeDefined();

    // Count occurrences of callout markers — should match number of highlights (2)
    const calloutMatches = content!.match(/> \[!important\]/g) || [];
    expect(calloutMatches.length).toBe(2);

    // The non-highlighted block should not be a callout
    expect(content).not.toContain('> Non highlighted part');
    expect(content).toContain('Non highlighted part');
  });

  it('multiple highlights on different blocks rendered correctly', async () => {
    const transcriptNode = makeNode({
      id: 'yt-multihighlight1',
      title: 'Multi Highlight Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 20,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'Block A text' },
          { start_ms: 5000, end_ms: 10000, text: 'Block B text' },
          { start_ms: 10000, end_ms: 15000, text: 'Block C text' },
        ],
        highlights: [
          { segment_start_ms: 0, tag: 'highlight' },
          { segment_start_ms: 10000, tag: 'highlight' },
        ],
      },
    });

    // Three different speakers → three separate blocks
    const vp0 = makeNode({
      id: 'vp-yt-multihighlight1-S00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-multihighlight1',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    const vp1 = makeNode({
      id: 'vp-yt-multihighlight1-S01',
      type: 'voice_print',
      confidence: 0.8,
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'yt-multihighlight1',
        segments: [{ start_ms: 5000, end_ms: 10000 }],
      },
    });

    const vp2 = makeNode({
      id: 'vp-yt-multihighlight1-S02',
      type: 'voice_print',
      confidence: 0.7,
      properties: {
        speakerLabel: 'SPEAKER_02',
        videoNodeId: 'yt-multihighlight1',
        segments: [{ start_ms: 10000, end_ms: 15000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, vp0, vp1, vp2] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Multi Highlight Test')
    )?.[1];

    expect(content).toBeDefined();

    // Two separate callout blocks
    const calloutMatches = content!.match(/> \[!important\]/g) || [];
    expect(calloutMatches.length).toBe(2);

    // Block A and Block C are callouts
    expect(content).toContain('> Block A text');
    expect(content).toContain('> Block C text');

    // Block B is NOT a callout
    expect(content).toContain('Block B text');
    expect(content).not.toContain('> Block B text');
  });

  it('comment on block without highlight renders normally', async () => {
    const transcriptNode = makeNode({
      id: 'yt-commentonly1',
      title: 'Comment Only Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 10,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'Statement with comment only' },
          { start_ms: 5000, end_ms: 10000, text: 'Plain statement' },
        ],
        highlights: [],
        comments: [{ segment_start_ms: 2000, text: 'Bra poäng här' }],
      },
    });

    const vp0 = makeNode({
      id: 'vp-yt-commentonly1-S00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-commentonly1',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    const vp1 = makeNode({
      id: 'vp-yt-commentonly1-S01',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'yt-commentonly1',
        segments: [{ start_ms: 5000, end_ms: 10000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, vp0, vp1] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault' });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Comment Only Test')
    )?.[1];

    expect(content).toBeDefined();

    // Heading should NOT be wrapped in callout (no highlight)
    expect(content).not.toContain('> [!important]');
    expect(content).not.toContain('> Statement with comment only');

    // Text should render normally
    expect(content).toContain('Statement with comment only');

    // Comment IS rendered after the block
    expect(content).toContain('<!-- kommentar: Bra poäng här -->');

    // Comment appears after the block text, not before
    const textIdx = content!.indexOf('Statement with comment only');
    const commentIdx = content!.indexOf('<!-- kommentar: Bra poäng här -->');
    expect(commentIdx).toBeGreaterThan(textIdx);
  });

  it('export returns count of written files', async () => {
    const node1 = makeNode({
      id: 'doc-count-1',
      title: 'Count Test A',
      type: 'document',
      properties: { text: 'Content A' },
    });

    const node2 = makeNode({
      id: 'doc-count-2',
      title: 'Count Test B',
      type: 'document',
      properties: { text: 'Content B' },
    });

    const node3 = makeNode({
      id: 'doc-count-3',
      title: 'Count Test C',
      type: 'document',
      properties: { text: 'Content C' },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [node1, node2, node3] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await obsidianExportCommand({ vault: '/tmp/vault' });

    expect(result).toEqual({ exported: 3 });
    expect(writtenFiles.size).toBe(3);
  });

  describe('AC4-AC6: exported_at frontmatter and stale cleanup', () => {
    it('AC4: exported file contains exported_at with valid ISO timestamp', async () => {
      const docNode = makeNode({
        id: 'ac4-doc',
        title: 'AC4 Test',
        type: 'document',
        properties: { text: 'Some content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault' });

      expect(writtenFiles.size).toBe(1);
      const content = [...writtenFiles.values()][0];
      expect(content).toMatch(/exported_at: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/);
    });

    it('AC5: export does NOT delete the Aurora directory (rm not called with recursive:true for directory)', async () => {
      const docNode = makeNode({
        id: 'ac5-doc',
        title: 'AC5 Test',
        type: 'document',
        properties: { text: 'Content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

      mockReaddir.mockResolvedValue([]);

      await obsidianExportCommand({ vault: '/tmp/vault' });

      // rm should NOT have been called with { recursive: true } on the directory
      const rmCallsWithRecursive = mockRm.mock.calls.filter(
        (args: unknown[]) => args[1] && (args[1] as Record<string, unknown>).recursive === true
      );
      expect(rmCallsWithRecursive).toHaveLength(0);
    });

    it('AC6: stale files (not matching current nodes) are removed', async () => {
      const docNode = makeNode({
        id: 'ac6-doc',
        title: 'AC6 Test',
        type: 'document',
        properties: { text: 'Content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

      // Simulate that the directory has both current node file AND a stale file
      mockReaddir.mockResolvedValue(['AC6 Test.md', 'stale-old-node.md']);

      await obsidianExportCommand({ vault: '/tmp/vault' });

      // rm should have been called for the stale file only
      const rmCalls = mockRm.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === 'string' && (args[0] as string).includes('stale-old-node.md')
      );
      expect(rmCalls).toHaveLength(1);
    });
  });
});
