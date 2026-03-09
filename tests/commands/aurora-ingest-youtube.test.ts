import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  isWorkerAvailable: () => mockIsWorkerAvailable(),
}));

// Mock youtube module
const mockIngestYouTube = vi.fn();
const mockIsYouTubeUrl = vi.fn();
vi.mock('../../src/aurora/youtube.js', () => ({
  ingestYouTube: (...args: unknown[]) => mockIngestYouTube(...args),
  isYouTubeUrl: (...args: unknown[]) => mockIsYouTubeUrl(...args),
}));

import { auroraIngestYouTubeCommand } from '../../src/commands/aurora-ingest-youtube.js';

describe('aurora:ingest-youtube command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockIsWorkerAvailable.mockReset();
    mockIngestYouTube.mockReset();
    mockIsYouTubeUrl.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows error for non-YouTube URL', async () => {
    mockIsYouTubeUrl.mockReturnValue(false);
    await auroraIngestYouTubeCommand('https://example.com', {});
    expect(consoleErrors.join('\n')).toContain('Not a valid YouTube URL');
  });

  it('shows worker not available message when Python missing', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIsWorkerAvailable.mockResolvedValue(false);
    await auroraIngestYouTubeCommand('https://www.youtube.com/watch?v=abc123', {});
    expect(consoleErrors.join('\n')).toContain('not available');
  });

  it('ingests YouTube video and shows correct output', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestYouTube.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
    });

    await auroraIngestYouTubeCommand('https://www.youtube.com/watch?v=abc123', {});
    const output = consoleOutput.join('\n');
    expect(output).toContain('YouTube video ingested');
    expect(output).toContain('Test Video');
    expect(output).toContain('yt-abc123');
  });

  it('shows voice prints when diarize flag is set', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestYouTube.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 3,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
    });

    await auroraIngestYouTubeCommand('https://www.youtube.com/watch?v=abc123', { diarize: true });
    const output = consoleOutput.join('\n');
    expect(output).toContain('Voice prints: 3');
  });

  it('handles ingest errors gracefully', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestYouTube.mockRejectedValue(new Error('download failed'));

    await auroraIngestYouTubeCommand('https://www.youtube.com/watch?v=abc123', {});
    expect(consoleErrors.join('\n')).toContain('download failed');
  });

  it('passes diarize option to ingestYouTube', async () => {
    mockIsYouTubeUrl.mockReturnValue(true);
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestYouTube.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
    });

    await auroraIngestYouTubeCommand('https://www.youtube.com/watch?v=abc123', { diarize: true, scope: 'shared' });
    expect(mockIngestYouTube).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining({ diarize: true, scope: 'shared' }),
    );
  });
});
