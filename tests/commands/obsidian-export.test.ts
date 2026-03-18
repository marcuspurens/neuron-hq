import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track fs calls
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockRm = vi.fn();

vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  rm: (...args: unknown[]) => mockRm(...args),
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
      .mockResolvedValueOnce({ rows: [docNode] })  // nodes query
      .mockResolvedValueOnce({ rows: [] });          // edges query

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
    const transcriptContent = [...writtenFiles.entries()].find(
      ([path]) => path.includes('Test Video Transcript'),
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
        rawSegments: [
          { start_ms: 0, end_ms: 3000, text: 'Some text' },
        ],
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
        rawSegments: [
          { start_ms: 0, end_ms: 1000, text: 'Hello' },
        ],
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

    const content = [...writtenFiles.entries()].find(
      ([path]) => path.includes('Duration Test'),
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

  it('exports chunks normally for non-video transcript nodes', async () => {
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

    // Both should be written
    expect(writtenFiles.size).toBe(2);
    const chunkContent = [...writtenFiles.entries()].find(
      ([path]) => path.includes('chunk'),
    )?.[1];
    expect(chunkContent).toContain('## Utdrag');
  });
});
