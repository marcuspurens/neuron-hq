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

vi.mock('../../src/core/ollama.js', () => ({
  ensureOllama: vi.fn().mockResolvedValue(false),
  getOllamaUrl: vi.fn().mockReturnValue('http://localhost:11434'),
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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    expect(writtenFiles.size).toBe(1);
    const [[path, content]] = [...writtenFiles.entries()];

    expect(path).toContain('/Aurora/Dokument/My Document.md');
    expect(content).toContain('typ: document');
    expect(content).toContain('Hello world content');
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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    // voice_print nodes are skipped — only transcript gets exported
    expect(writtenFiles.size).toBe(1);
    const [[transcriptPath, transcriptContent]] = [...writtenFiles.entries()];

    expect(transcriptPath).toContain('/Aurora/Video/Test Video Transcript.md');
    expect(transcriptContent).toBeDefined();

    expect(transcriptContent).toContain('## Talare');
    expect(transcriptContent).toContain('| SPEAKER_00 |');
    expect(transcriptContent).not.toContain('_ej identifierad_');

    expect(transcriptContent).toContain('## Tidslinje');
    expect(transcriptContent).toContain('00:00:00');
    expect(transcriptContent).toContain('Hello from speaker zero');
    expect(transcriptContent).toContain('Now speaker one talks');

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    // Only 1 file should be written (transcript), not the chunk
    expect(writtenFiles.size).toBe(1);
    const paths = [...writtenFiles.keys()];
    expect(paths.some((p) => p.includes('chunk'))).toBe(false);
  });

  it('frontmatter contains duration in hh:mm:ss format and speaker table in body', async () => {
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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Duration Test')
    )?.[1];

    expect(content).toBeDefined();

    // Frontmatter checks
    expect(content).toContain('duration: "01:02:03"');
    expect(content).not.toContain('speakers:');
    expect(content).toContain('| SPEAKER_00 |');
    expect(content).toContain('| Label | Förnamn | Efternamn | Roll | Titel | Organisation | Avdelning | Wikidata | LinkedIn |');
  });

  it('suppresses speaker labels in timeline when only 1 unique speaker', async () => {
    const transcriptNode = makeNode({
      id: 'yt-singlespeaker',
      title: 'Single Speaker Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 300,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'First segment text.' },
          { start_ms: 60000, end_ms: 120000, text: 'Second segment text.' },
          { start_ms: 180000, end_ms: 240000, text: 'Third segment text.' },
        ],
        chapters: [
          { start_time: 0, title: 'Chapter One' },
          { start_time: 60, title: 'Chapter Two' },
          { start_time: 180, title: 'Chapter Three' },
        ],
      },
    });

    const voicePrint = makeNode({
      id: 'vp-yt-singlespeaker-SPEAKER_00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-singlespeaker',
        segments: [
          { start_ms: 0, end_ms: 5000 },
          { start_ms: 60000, end_ms: 120000 },
          { start_ms: 180000, end_ms: 240000 },
        ],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, voicePrint] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Single Speaker Test')
    )?.[1];

    expect(content).toBeDefined();

    expect(content).toContain('### Chapter One');
    expect(content).toContain('### Chapter Two');
    expect(content).toContain('### Chapter Three');

    expect(content).not.toContain('· SPEAKER_00');

    expect(content).toContain('> 00:00:00');
  });

  it('shows speaker labels when 2+ unique speakers exist', async () => {
    const transcriptNode = makeNode({
      id: 'yt-multispeaker',
      title: 'Multi Speaker Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 20,
        rawSegments: [
          { start_ms: 0, end_ms: 5000, text: 'Speaker zero talking.' },
          { start_ms: 5000, end_ms: 10000, text: 'Speaker one talking.' },
        ],
      },
    });

    const vp0 = makeNode({
      id: 'vp-yt-multispeaker-S00',
      type: 'voice_print',
      confidence: 0.9,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-multispeaker',
        segments: [{ start_ms: 0, end_ms: 5000 }],
      },
    });

    const vp1 = makeNode({
      id: 'vp-yt-multispeaker-S01',
      type: 'voice_print',
      confidence: 0.8,
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'yt-multispeaker',
        segments: [{ start_ms: 5000, end_ms: 10000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, vp0, vp1] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Multi Speaker Test')
    )?.[1];

    expect(content).toBeDefined();

    // Speaker labels SHOULD appear when multiple speakers
    expect(content).toContain('· SPEAKER_00');
    expect(content).toContain('· SPEAKER_01');
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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

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

    const result = await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    expect(result).toEqual({ exported: 3 });
    expect(writtenFiles.size).toBe(3);
  });

  it('exports provenance fields in non-video frontmatter', async () => {
    const docNode = makeNode({
      id: 'prov-1',
      title: 'Provenance Test',
      type: 'document',
      properties: {
        text: 'Content',
        provenance: {
          agent: 'System',
          method: 'web_scrape',
          model: null,
        },
      },
    });

    mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.values()][0];
    expect(content).toContain('källa_typ: web_scrape');
    expect(content).toContain('källa_agent: System');
    expect(content).not.toContain('källa_modell');
  });

  it('does not export provenance when not present', async () => {
    const docNode = makeNode({
      id: 'no-prov-1',
      title: 'No Provenance Test',
      type: 'document',
      properties: { text: 'Content' },
    });

    mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.values()][0];
    expect(content).not.toContain('källa_typ');
    expect(content).not.toContain('källa_agent');
    expect(content).not.toContain('källa_modell');
  });

  it('quotes tags containing spaces in frontmatter YAML', async () => {
    const docNode = makeNode({
      id: 'tag-space-1',
      title: 'Tag Space Test',
      type: 'document',
      properties: {
        text: 'Content here',
        tags: ['simple', 'job displacement', 'AI', 'multi word tag'],
      },
    });

    mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.values()][0];

    expect(content).toContain('tags: [simple, "job displacement", AI, "multi word tag"]');
  });

  it('exports PageDigest as collapsible pipeline details table', async () => {
    const docNode = makeNode({
      id: 'pdf-digest-1',
      title: 'PDF With Digests',
      type: 'document',
      properties: {
        text: 'Page content here',
        source_type: 'pdf_rich',
        pageDigests: [
          {
            page: 1,
            textExtraction: { method: 'pypdfium2', charCount: 1847, garbled: false },
            ocrFallback: null,
            vision: {
              model: 'qwen3-vl:8b',
              description: 'Table with 3 columns: Rank, Employer, Score',
              textOnly: false,
            },
            combinedCharCount: 2100,
          },
          {
            page: 2,
            textExtraction: { method: 'pypdfium2', charCount: 2103, garbled: false },
            ocrFallback: null,
            vision: { model: 'qwen3-vl:8b', description: 'TEXT_ONLY', textOnly: true },
            combinedCharCount: 2103,
          },
        ],
      },
    });

    mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.values()][0];
    expect(content).toContain('> [!info]- Pipeline-detaljer per sida');
    expect(content).toContain('| 1 | pypdfium2 | 1847 | nej | — | qwen3-vl:8b |');
    expect(content).toContain('| 2 | pypdfium2 | 2103 | nej | — | qwen3-vl:8b | TEXT_ONLY |');
  });

  it('omits pipeline details when no pageDigests', async () => {
    const docNode = makeNode({
      id: 'pdf-no-digest',
      title: 'PDF Without Digests',
      type: 'document',
      properties: { text: 'Content', source_type: 'pdf' },
    });

    mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.values()][0];
    expect(content).not.toContain('Pipeline-detaljer');
  });

  describe('AC4-AC6: exported_at frontmatter and stale cleanup', () => {
    it('AC4: exported file contains frontmatter with typ field and correct subdir', async () => {
      const docNode = makeNode({
        id: 'ac4-doc',
        title: 'AC4 Test',
        type: 'document',
        properties: { text: 'Some content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      expect(writtenFiles.size).toBe(1);
      const [[path, content]] = [...writtenFiles.entries()];
      expect(path).toContain('/Aurora/Dokument/AC4 Test.md');
      expect(content).toContain('typ: document');
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

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      // rm should NOT have been called with { recursive: true } on the directory
      const rmCallsWithRecursive = mockRm.mock.calls.filter(
        (args: unknown[]) => args[1] && (args[1] as Record<string, unknown>).recursive === true
      );
      expect(rmCallsWithRecursive).toHaveLength(0);
    });

    it('AC6: stale files (not matching current nodes) are removed per-subdirectory', async () => {
      const docNode = makeNode({
        id: 'ac6-doc',
        title: 'AC6 Test',
        type: 'document',
        properties: { text: 'Content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [docNode] }).mockResolvedValueOnce({ rows: [] });

      mockReaddir.mockImplementation((dir: string) => {
        if (typeof dir === 'string' && dir.endsWith('/Dokument')) {
          return Promise.resolve(['AC6 Test.md', 'stale-old-node.md']);
        }
        return Promise.resolve([]);
      });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const rmCalls = mockRm.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === 'string' && (args[0] as string).includes('stale-old-node.md')
      );
      expect(rmCalls).toHaveLength(1);

      const noAc6Rm = mockRm.mock.calls.filter(
        (args: unknown[]) =>
          typeof args[0] === 'string' && (args[0] as string).includes('AC6 Test.md')
      );
      expect(noAc6Rm).toHaveLength(0);
    });
  });

  describe('type-based subdirectory routing', () => {
    it('routes article nodes to Aurora/Artikel/', async () => {
      const node = makeNode({
        id: 'art-1',
        title: 'My Article',
        type: 'article',
        properties: { text: 'Article content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [node] }).mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const path = [...writtenFiles.keys()][0];
      expect(path).toBe('/tmp/vault/Aurora/Artikel/My Article.md');
    });

    it('routes concept nodes to Aurora/Koncept/', async () => {
      const node = makeNode({
        id: 'concept-1',
        title: 'My Concept',
        type: 'concept',
        properties: { text: 'Concept content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [node] }).mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const path = [...writtenFiles.keys()][0];
      expect(path).toBe('/tmp/vault/Aurora/Koncept/My Concept.md');
    });

    it('routes unknown types to Aurora/ root', async () => {
      const node = makeNode({
        id: 'fact-1',
        title: 'Some Fact',
        type: 'fact',
        properties: { text: 'Fact content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [node] }).mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const path = [...writtenFiles.keys()][0];
      expect(path).toBe('/tmp/vault/Aurora/Some Fact.md');
    });

    it('skips voice_print and speaker_identity nodes from export', async () => {
      const vpNode = makeNode({
        id: 'vp-1',
        title: 'Speaker: SPEAKER_00',
        type: 'voice_print',
        properties: { speakerLabel: 'SPEAKER_00', videoNodeId: 'yt-1' },
      });

      const siNode = makeNode({
        id: 'si-1',
        title: 'Speaker Identity',
        type: 'speaker_identity',
        properties: { name: 'Alice' },
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [vpNode, siNode] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      expect(writtenFiles.size).toBe(0);
      expect(result.exported).toBe(0);
    });

    it('creates subdirectories via mkdir', async () => {
      const node = makeNode({
        id: 'doc-mkdir',
        title: 'MkDir Test',
        type: 'document',
        properties: { text: 'Content' },
      });

      mockQuery.mockResolvedValueOnce({ rows: [node] }).mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const mkdirPaths = mockMkdir.mock.calls.map((args: unknown[]) => args[0] as string);
      expect(mkdirPaths).toContain('/tmp/vault/Aurora/Video');
      expect(mkdirPaths).toContain('/tmp/vault/Aurora/Dokument');
      expect(mkdirPaths).toContain('/tmp/vault/Aurora/Artikel');
      expect(mkdirPaths).toContain('/tmp/vault/Aurora/Koncept');
    });
  });

  describe('extended video frontmatter', () => {
    it('includes videoUrl, språk, tags, publicerad, and confidence (no provenance or tldr)', async () => {
      const transcriptNode = makeNode({
        id: 'yt-fm-full',
        title: 'Full FM Video',
        type: 'transcript',
        confidence: 0.92,
        properties: {
          platform: 'youtube',
          duration: 60,
          rawSegments: [{ start_ms: 0, end_ms: 5000, text: 'Hello' }],
          videoUrl: 'https://youtube.com/watch?v=abc',
          language: 'sv',
          ytTags: ['AI', 'machine learning'],
          videoDescription: 'Great video #ai #deeplearning',
          publishedDate: '2026-03-15',
          summary: 'A great video about AI',
          provenance: { method: 'transcription', agent: 'System', model: 'whisper' },
        },
      });

      const vp = makeNode({
        id: 'vp-fm-full',
        type: 'voice_print',
        confidence: 0.9,
        properties: {
          speakerLabel: 'SPEAKER_00',
          videoNodeId: 'yt-fm-full',
          segments: [{ start_ms: 0, end_ms: 5000 }],
        },
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [transcriptNode, vp] })
        .mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const content = [...writtenFiles.entries()].find(([p]) =>
        p.includes('Full FM Video')
      )?.[1];

      expect(content).toBeDefined();
      expect(content).toContain('videoUrl: "https://youtube.com/watch?v=abc"');
      expect(content).toContain('språk: sv');
      expect(content).toContain('tags: [ai, deeplearning]');
      expect(content).toContain('publicerad: 2026-03-15');
      expect(content).toContain('confidence: 0.92');
      expect(content).toContain('tldr: "A great video about AI"');
      expect(content).not.toContain('källa_typ:');
      expect(content).not.toContain('källa_agent:');
      expect(content).not.toContain('källa_modell:');
    });

    it('omits optional fields when not present', async () => {
      const transcriptNode = makeNode({
        id: 'yt-fm-minimal',
        title: 'Minimal FM Video',
        type: 'transcript',
        confidence: 0.5,
        properties: {
          platform: 'youtube',
          duration: 30,
          rawSegments: [{ start_ms: 0, end_ms: 3000, text: 'Hi' }],
        },
      });

      const vp = makeNode({
        id: 'vp-fm-minimal',
        type: 'voice_print',
        confidence: 0.7,
        properties: {
          speakerLabel: 'SPEAKER_00',
          videoNodeId: 'yt-fm-minimal',
          segments: [{ start_ms: 0, end_ms: 3000 }],
        },
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [transcriptNode, vp] })
        .mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const content = [...writtenFiles.entries()].find(([p]) =>
        p.includes('Minimal FM Video')
      )?.[1];

      expect(content).toBeDefined();
      expect(content).not.toContain('videoUrl:');
      expect(content).not.toContain('språk:');
      expect(content).not.toContain('tags:');
      expect(content).not.toContain('publicerad:');
      expect(content).not.toContain('tldr:');
      expect(content).toContain('confidence: 0.5');
    });

    it('prefers hashtags from description over ytTags for tags field', async () => {
      const transcriptNode = makeNode({
        id: 'yt-fm-hashtags',
        title: 'Hashtag Test Video',
        type: 'transcript',
        confidence: 0.8,
        properties: {
          platform: 'youtube',
          duration: 30,
          rawSegments: [{ start_ms: 0, end_ms: 3000, text: 'Hi' }],
          ytTags: ['generic', 'youtube tag'],
          videoDescription: 'Check this out #react #typescript',
        },
      });

      const vp = makeNode({
        id: 'vp-fm-hashtags',
        type: 'voice_print',
        confidence: 0.7,
        properties: {
          speakerLabel: 'SPEAKER_00',
          videoNodeId: 'yt-fm-hashtags',
          segments: [{ start_ms: 0, end_ms: 3000 }],
        },
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [transcriptNode, vp] })
        .mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const content = [...writtenFiles.entries()].find(([p]) =>
        p.includes('Hashtag Test Video')
      )?.[1];

      expect(content).toBeDefined();
      expect(content).toContain('tags: [react, typescript]');
      expect(content).not.toContain('generic');
    });

    it('falls back to ytTags when description has no hashtags', async () => {
      const transcriptNode = makeNode({
        id: 'yt-fm-notags',
        title: 'No Hashtags Video',
        type: 'transcript',
        confidence: 0.8,
        properties: {
          platform: 'youtube',
          duration: 30,
          rawSegments: [{ start_ms: 0, end_ms: 3000, text: 'Hi' }],
          ytTags: ['fallback', 'tags'],
          videoDescription: 'Just a plain description without hashtags.',
        },
      });

      const vp = makeNode({
        id: 'vp-fm-notags',
        type: 'voice_print',
        confidence: 0.7,
        properties: {
          speakerLabel: 'SPEAKER_00',
          videoNodeId: 'yt-fm-notags',
          segments: [{ start_ms: 0, end_ms: 3000 }],
        },
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [transcriptNode, vp] })
        .mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const content = [...writtenFiles.entries()].find(([p]) =>
        p.includes('No Hashtags Video')
      )?.[1];

      expect(content).toBeDefined();
      expect(content).toContain('tags: [fallback, tags]');
    });

    it('includes channel, views, likes, subscribers, description, and chapters', async () => {
      const transcriptNode = makeNode({
        id: 'yt-fm-rich',
        title: 'Rich Metadata Video',
        type: 'transcript',
        confidence: 0.9,
        properties: {
          platform: 'youtube',
          duration: 120,
          rawSegments: [
            { start_ms: 0, end_ms: 5000, text: 'Hello from introduction.' },
            { start_ms: 60000, end_ms: 120000, text: 'A2A is a protocol for agent communication.' },
            { start_ms: 180000, end_ms: 240000, text: 'MCP stands for Model Context Protocol.' },
          ],
          videoUrl: 'https://youtube.com/watch?v=rich123',
          channelName: 'IBM Technology',
          channelHandle: '@IBMTechnology',
          viewCount: 92445,
          likeCount: 2689,
          channelFollowerCount: 1650000,
          videoDescription: 'Learn about A2A and MCP protocols.',
          chapters: [
            { start_time: 0, title: 'Intro' },
            { start_time: 60, title: 'A2A Protocol' },
            { start_time: 180, title: 'MCP Protocol' },
          ],
          thumbnailUrl: 'https://i.ytimg.com/vi/rich123/maxresdefault.jpg',
        },
      });

      const vp = makeNode({
        id: 'vp-fm-rich',
        type: 'voice_print',
        confidence: 0.7,
        properties: {
          speakerLabel: 'SPEAKER_00',
          videoNodeId: 'yt-fm-rich',
          segments: [
            { start_ms: 0, end_ms: 5000 },
            { start_ms: 60000, end_ms: 120000 },
            { start_ms: 180000, end_ms: 240000 },
          ],
        },
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [transcriptNode, vp] })
        .mockResolvedValueOnce({ rows: [] });

      await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

      const content = [...writtenFiles.entries()].find(([p]) =>
        p.includes('Rich Metadata Video')
      )?.[1];

      expect(content).toBeDefined();
      expect(content).toContain('videoUrl: "https://youtube.com/watch?v=rich123"');
      expect(content).toContain('kanal: "IBM Technology"');
      expect(content).toContain('kanalhandle: "@IBMTechnology"');
      expect(content).toContain('visningar: 92445');
      expect(content).toContain('likes: 2689');
      expect(content).toContain('prenumeranter: 1650000');
      expect(content).toContain('thumbnail: "https://i.ytimg.com/vi/rich123/maxresdefault.jpg"');
      expect(content).toContain('## Beskrivning');
      expect(content).toContain('Learn about A2A and MCP protocols.');
      expect(content).toContain('## Kapitel');
      expect(content).toContain('[[#Intro|00:00:00 · Intro]]');
      expect(content).toContain('[[#A2A Protocol|00:01:00 · A2A Protocol]]');
      expect(content).toContain('[[#MCP Protocol|00:03:00 · MCP Protocol]]');
      expect(content).toContain('### Intro');
      expect(content).toContain('### A2A Protocol');
      expect(content).toContain('### MCP Protocol');
    });
  });

  it('renders word-level timecode spans when words are present', async () => {
    const transcriptNode = makeNode({
      id: 'yt-wordspans',
      title: 'Word Spans Test',
      type: 'transcript',
      properties: {
        platform: 'youtube',
        duration: 10,
        rawSegments: [
          {
            start_ms: 0,
            end_ms: 3000,
            text: 'Hello world test',
            words: [
              { start_ms: 0, end_ms: 500, word: 'Hello ' },
              { start_ms: 500, end_ms: 1500, word: 'world ' },
              { start_ms: 1500, end_ms: 3000, word: 'test' },
            ],
          },
        ],
      },
    });

    const voicePrint = makeNode({
      id: 'vp-yt-wordspans-SPEAKER_00',
      title: 'Speaker: SPEAKER_00',
      type: 'voice_print',
      confidence: 0.7,
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'yt-wordspans',
        segments: [{ start_ms: 0, end_ms: 3000 }],
      },
    });

    mockQuery
      .mockResolvedValueOnce({ rows: [transcriptNode, voicePrint] })
      .mockResolvedValueOnce({ rows: [] });

    await obsidianExportCommand({ vault: '/tmp/vault', skipImport: true });

    const content = [...writtenFiles.entries()].find(([path]) =>
      path.includes('Word Spans Test')
    )?.[1];

    expect(content).toBeDefined();
    expect(content).toContain('## Tidslinje');
    expect(content).toContain('<span data-t="0">Hello </span>');
    expect(content).toContain('<span data-t="500">world </span>');
    expect(content).toContain('<span data-t="1500">test</span>');
  });
});
