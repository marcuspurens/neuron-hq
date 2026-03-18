import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../src/core/db.js', () => ({
  getPool: vi.fn().mockReturnValue({
    query: (...args: unknown[]) => mockQuery(...args),
  }),
}));

import { auroraShowCommand } from '../../src/commands/aurora-show.js';

/** Helper: build a fake transcript node row. */
function fakeTranscriptNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'node-1',
    title: 'Test Transcript',
    type: 'transcript',
    scope: 'personal',
    confidence: 0.95,
    created: '2026-03-01T10:00:00.000Z',
    properties: {
      text: 'Hello world',
      rawSegments: [
        { start_ms: 0, end_ms: 30000, text: 'Hello from speaker zero' },
        { start_ms: 30000, end_ms: 60000, text: 'Hello from speaker one' },
        { start_ms: 60000, end_ms: 90000, text: 'Back to speaker zero' },
      ],
      ...overrides,
    },
  };
}

/** Helper: build voice_print rows for two speakers. */
function fakeVoicePrintRows() {
  return [
    {
      id: 'vp-1',
      title: 'SPEAKER_00',
      type: 'voice_print',
      properties: {
        speakerLabel: 'SPEAKER_00',
        videoNodeId: 'node-1',
        segments: [
          { start_ms: 0, end_ms: 30000 },
          { start_ms: 60000, end_ms: 90000 },
        ],
      },
    },
    {
      id: 'vp-2',
      title: 'SPEAKER_01',
      type: 'voice_print',
      properties: {
        speakerLabel: 'SPEAKER_01',
        videoNodeId: 'node-1',
        segments: [{ start_ms: 30000, end_ms: 60000 }],
      },
    },
  ];
}

/**
 * Default mock setup: node query, edges, chunks, voice_prints.
 * Caller can override any step by re-mocking after calling this.
 */
function setupDefaultMocks(node: Record<string, unknown>, vpRows: unknown[] = []) {
  mockQuery
    // 1. Node lookup
    .mockResolvedValueOnce({ rows: [node] })
    // 2. Edges
    .mockResolvedValueOnce({ rows: [] })
    // 3. Chunks
    .mockResolvedValueOnce({ rows: [] })
    // 4. Voice_print query (only called when rawSegments exist)
    .mockResolvedValueOnce({ rows: vpRows });
}

describe('aurora:show command – timeline', () => {
  let consoleOutput: string[];

  beforeEach(() => {
    mockQuery.mockReset();
    consoleOutput = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
  });

  it('displays timeline summary when rawSegments exist', async () => {
    setupDefaultMocks(fakeTranscriptNode(), fakeVoicePrintRows());

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    expect(output).toContain('Tidslinje');
    expect(output).toContain('talarbyten');
    expect(output).toContain('SPEAKER_00');
    expect(output).toContain('SPEAKER_01');
    expect(output).toContain('block');
  });

  it('does NOT display timeline when rawSegments is missing', async () => {
    const node = fakeTranscriptNode({ rawSegments: undefined });
    // No voice_print query should be made – only 3 queries total
    mockQuery
      .mockResolvedValueOnce({ rows: [node] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    expect(output).not.toContain('Tidslinje');
    expect(output).not.toContain('talarbyten');
    // Confirm voice_print query was never issued (only 3 queries)
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('does NOT display timeline when rawSegments is empty array', async () => {
    const node = fakeTranscriptNode({ rawSegments: [] });
    mockQuery
      .mockResolvedValueOnce({ rows: [node] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    expect(output).not.toContain('Tidslinje');
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('does NOT display timeline for non-transcript nodes', async () => {
    const node = {
      ...fakeTranscriptNode(),
      type: 'document',
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [node] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    expect(output).not.toContain('Tidslinje');
  });

  it('speaker change count is correct', async () => {
    // Segments: SPEAKER_00 -> SPEAKER_01 -> SPEAKER_00 = 2 speaker changes
    setupDefaultMocks(fakeTranscriptNode(), fakeVoicePrintRows());

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    expect(output).toContain('2 talarbyten');
  });

  it('shows correct block counts per speaker', async () => {
    setupDefaultMocks(fakeTranscriptNode(), fakeVoicePrintRows());

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    // SPEAKER_00 has 2 blocks (start + return), SPEAKER_01 has 1 block
    expect(output).toMatch(/SPEAKER_00.*2 block/);
    expect(output).toMatch(/SPEAKER_01.*1 block/);
  });

  it('uses tree-line formatting with last speaker getting box-drawing end', async () => {
    setupDefaultMocks(fakeTranscriptNode(), fakeVoicePrintRows());

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    // First speaker uses ├─, last uses └─
    expect(output).toContain('├─');
    expect(output).toContain('└─');
  });

  it('formats duration correctly', async () => {
    setupDefaultMocks(fakeTranscriptNode(), fakeVoicePrintRows());

    await auroraShowCommand('node-1');

    const output = consoleOutput.join('\n');
    // SPEAKER_00: 30s + 30s = 60s = 00:01:00
    expect(output).toMatch(/SPEAKER_00.*00:01:00/);
    // SPEAKER_01: 30s = 00:00:30
    expect(output).toMatch(/SPEAKER_01.*00:00:30/);
  });
});
