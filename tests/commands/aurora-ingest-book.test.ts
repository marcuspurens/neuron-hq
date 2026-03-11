import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  isWorkerAvailable: () => mockIsWorkerAvailable(),
}));

// Mock OCR module
const mockIngestImageBatch = vi.fn();
vi.mock('../../src/aurora/ocr.js', () => ({
  ingestImageBatch: (...args: unknown[]) => mockIngestImageBatch(...args),
}));

import { auroraIngestBookCommand } from '../../src/commands/aurora-ingest-book.js';

describe('aurora:ingest-book command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockIsWorkerAvailable.mockReset();
    mockIngestImageBatch.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows batch OCR result', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestImageBatch.mockResolvedValue({
      documentNodeId: 'doc_batch123',
      chunkNodeIds: ['doc_batch123_chunk_0'],
      title: 'Test Book',
      wordCount: 12450,
      chunkCount: 63,
      crossRefsCreated: 4,
      crossRefMatches: [],
      pageCount: 47,
      avgConfidence: 0.892,
      files: [],
    });

    await auroraIngestBookCommand('./scans/', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Done');
    expect(output).toContain('47');
    expect(output).toContain('12,450');
    expect(output).toContain('63');
    expect(output).toContain('0.892');
  });

  it('passes language and title options', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestImageBatch.mockResolvedValue({
      documentNodeId: 'doc_batch123',
      chunkNodeIds: [],
      title: 'Min bok',
      wordCount: 100,
      chunkCount: 1,
      crossRefsCreated: 0,
      crossRefMatches: [],
      pageCount: 5,
      avgConfidence: 0.9,
      files: [],
    });

    await auroraIngestBookCommand('./scans/', { language: 'sv', title: 'Min bok' });

    expect(mockIngestImageBatch).toHaveBeenCalledWith(
      './scans/',
      expect.objectContaining({ language: 'sv', title: 'Min bok' }),
    );
  });

  it('passes output path option', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockIngestImageBatch.mockResolvedValue({
      documentNodeId: 'doc_batch123',
      chunkNodeIds: [],
      title: 'test',
      wordCount: 50,
      chunkCount: 1,
      crossRefsCreated: 0,
      crossRefMatches: [],
      pageCount: 2,
      avgConfidence: 0.85,
      files: [],
      savedTo: '/tmp/output.md',
    });

    await auroraIngestBookCommand('./scans/', { output: '/tmp/output.md' });

    expect(mockIngestImageBatch).toHaveBeenCalledWith(
      './scans/',
      expect.objectContaining({ outputPath: '/tmp/output.md' }),
    );
    const output = consoleOutput.join('\n');
    expect(output).toContain('/tmp/output.md');
  });

  it('shows error when worker unavailable', async () => {
    mockIsWorkerAvailable.mockResolvedValue(false);

    await auroraIngestBookCommand('./scans/', {});

    expect(consoleErrors.join('\n')).toContain('not available');
  });
});
