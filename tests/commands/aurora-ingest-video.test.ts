import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  isWorkerAvailable: () => mockIsWorkerAvailable(),
}));

// Mock video module
const mockIngestVideo = vi.fn();
vi.mock('../../src/aurora/video.js', () => ({
  ingestVideo: (...args: unknown[]) => mockIngestVideo(...args),
}));

import { auroraIngestVideoCommand } from '../../src/commands/aurora-ingest-video.js';

describe('aurora:ingest-video command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockIsWorkerAvailable.mockReset();
    mockIngestVideo.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows worker not available message when Python missing', async () => {
    mockIsWorkerAvailable.mockResolvedValue(false);
    await auroraIngestVideoCommand('https://www.youtube.com/watch?v=abc123', {});
    expect(consoleErrors.join('\n')).toContain('not available');
  });

  it('ingests video and shows correct output', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
      platform: 'youtube',
    });

    await auroraIngestVideoCommand('https://www.youtube.com/watch?v=abc123', {});
    const output = consoleOutput.join('\n');
    expect(output).toContain('Video ingested');
    expect(output).toContain('Test Video');
    expect(output).toContain('yt-abc123');
    expect(output).toContain('youtube');
  });

  it('shows voice prints when diarize flag is set', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 3,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
      platform: 'youtube',
    });

    await auroraIngestVideoCommand('https://www.youtube.com/watch?v=abc123', { diarize: true });
    const output = consoleOutput.join('\n');
    expect(output).toContain('Voice prints: 3');
  });

  it('handles ingest errors gracefully', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestVideo.mockRejectedValue(new Error('download failed'));

    await auroraIngestVideoCommand('https://www.youtube.com/watch?v=abc123', {});
    expect(consoleErrors.join('\n')).toContain('download failed');
  });

  it('passes diarize option to ingestVideo', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
      platform: 'youtube',
    });

    await auroraIngestVideoCommand('https://www.youtube.com/watch?v=abc123', { diarize: true, scope: 'shared' });
    expect(mockIngestVideo).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining({ diarize: true, scope: 'shared' }),
    );
  });

  it('accepts non-YouTube video URLs', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'vid-abc123456789',
      chunksCreated: 3,
      voicePrintsCreated: 0,
      title: 'SVT Nyheter',
      duration: 300,
      videoId: null,
      platform: 'svtplay',
    });

    await auroraIngestVideoCommand('https://www.svt.se/nyheter/test', {});
    const output = consoleOutput.join('\n');
    expect(output).toContain('Video ingested');
    expect(output).toContain('SVT Nyheter');
    expect(output).toContain('svtplay');
    expect(output).not.toContain('Video ID');
  });

  it('passes language option to ingestVideo', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
      platform: 'youtube',
    });

    await auroraIngestVideoCommand('https://www.youtube.com/watch?v=abc123', {
      language: 'sv',
    });

    expect(mockIngestVideo).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining({ language: 'sv' }),
    );
  });

  it('shows model used in output when available', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestVideo.mockResolvedValue({
      transcriptNodeId: 'yt-abc123',
      chunksCreated: 5,
      voicePrintsCreated: 0,
      title: 'Test Video',
      duration: 120,
      videoId: 'abc123',
      platform: 'youtube',
      modelUsed: 'KBLab/kb-whisper-large',
    });

    await auroraIngestVideoCommand('https://www.youtube.com/watch?v=abc123', {});
    const output = consoleOutput.join('\n');
    expect(output).toContain('Model used: KBLab/kb-whisper-large');
  });
});
