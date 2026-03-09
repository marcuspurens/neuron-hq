import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  isWorkerAvailable: () => mockIsWorkerAvailable(),
}));

const mockIngestUrl = vi.fn();
const mockIngestDocument = vi.fn();
vi.mock('../../src/aurora/intake.js', () => ({
  ingestUrl: (...args: unknown[]) => mockIngestUrl(...args),
  ingestDocument: (...args: unknown[]) => mockIngestDocument(...args),
}));

const mockIngestYouTube = vi.fn();
const mockIsYouTubeUrl = vi.fn();
vi.mock('../../src/aurora/youtube.js', () => ({
  ingestYouTube: (...args: unknown[]) => mockIngestYouTube(...args),
  isYouTubeUrl: (...args: unknown[]) => mockIsYouTubeUrl(...args),
}));

import { auroraIngestCommand } from '../../src/commands/aurora-ingest.js';
import { auroraIngestYouTubeCommand } from '../../src/commands/aurora-ingest-youtube.js';

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

describe('aurora:ingest cross-ref CLI output', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  /* ---------------------------------------------------------------- */
  /*  URL ingest cross-ref display                                     */
  /* ---------------------------------------------------------------- */

  it('shows cross-ref info when matches exist', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestUrl.mockResolvedValue({
      documentNodeId: 'doc_abc123',
      chunkNodeIds: ['doc_abc123_chunk_0'],
      title: 'TypeScript Best Practices',
      wordCount: 1500,
      chunkCount: 1,
      crossRefsCreated: 2,
      crossRefMatches: [
        {
          neuronNodeId: 'pattern-001',
          neuronTitle: 'strict-mode-enforcement',
          similarity: 0.89,
          relationship: 'enriches',
        },
        {
          neuronNodeId: 'technique-002',
          neuronTitle: 'type-guard-validation',
          similarity: 0.73,
          relationship: 'enriches',
        },
      ],
    });

    await auroraIngestCommand('https://example.com/article', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('cross-reference');
    expect(output).toContain('strict-mode-enforcement');
    expect(output).toContain('type-guard-validation');
    expect(output).toContain('0.89');
    expect(output).toContain('0.73');
  });

  it('does NOT show cross-ref section when no matches', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestUrl.mockResolvedValue({
      documentNodeId: 'doc_xyz789',
      chunkNodeIds: [],
      title: 'Generic Article',
      wordCount: 500,
      chunkCount: 0,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    await auroraIngestCommand('https://example.com/other', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Generic Article');
    expect(output).not.toContain('cross-reference');
  });

  /* ---------------------------------------------------------------- */
  /*  YouTube ingest cross-ref display                                 */
  /* ---------------------------------------------------------------- */

  it('shows cross-ref info for YouTube ingest when matches exist', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestYouTube.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Coding Tutorial',
      duration: 300,
      videoId: 'abc123',
      crossRefsCreated: 1,
      crossRefMatches: [
        {
          neuronNodeId: 'pattern-015',
          neuronTitle: 'error-handling-pattern',
          similarity: 0.82,
          relationship: 'enriches',
        },
      ],
    });

    await auroraIngestYouTubeCommand('https://www.youtube.com/watch?v=abc123', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('cross-reference');
    expect(output).toContain('error-handling-pattern');
    expect(output).toContain('0.82');
  });

  it('does NOT show cross-ref section for YouTube when no matches', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestYouTube.mockResolvedValue({
      transcriptNodeId: 'yt-xyz789',
      chunksCreated: 3,
      voicePrintsCreated: 0,
      title: 'Random Video',
      duration: 120,
      videoId: 'xyz789',
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    await auroraIngestYouTubeCommand('https://www.youtube.com/watch?v=xyz789', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Random Video');
    expect(output).not.toContain('cross-reference');
  });
});
