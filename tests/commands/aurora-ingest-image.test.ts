import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  isWorkerAvailable: () => mockIsWorkerAvailable(),
}));

// Mock OCR module
const mockIngestImage = vi.fn();
vi.mock('../../src/aurora/ocr.js', () => ({
  ingestImage: (...args: unknown[]) => mockIngestImage(...args),
}));

import { auroraIngestImageCommand } from '../../src/commands/aurora-ingest-image.js';

describe('aurora:ingest-image command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockIsWorkerAvailable.mockReset();
    mockIngestImage.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows OCR result with confidence', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestImage.mockResolvedValue({
      documentNodeId: 'doc_abc123',
      chunkNodeIds: ['doc_abc123_chunk_0'],
      title: 'screenshot',
      wordCount: 342,
      chunkCount: 4,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    await auroraIngestImageCommand('screenshot.png', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Ingested');
    expect(output).toContain('screenshot');
    expect(output).toContain('342');
    expect(output).toContain('4');
  });

  it('passes language option to worker', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestImage.mockResolvedValue({
      documentNodeId: 'doc_abc123',
      chunkNodeIds: [],
      title: 'test',
      wordCount: 10,
      chunkCount: 1,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    await auroraIngestImageCommand('test.png', { language: 'sv' });

    expect(mockIngestImage).toHaveBeenCalledWith(
      'test.png',
      expect.objectContaining({ language: 'sv' }),
    );
  });

  it('shows error for worker not available', async () => {
    mockIsWorkerAvailable.mockResolvedValue(false);

    await auroraIngestImageCommand('test.png', {});

    expect(consoleErrors.join('\n')).toContain('not available');
  });
});
