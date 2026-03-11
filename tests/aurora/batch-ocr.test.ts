import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockRunWorker = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  runWorker: (...args: unknown[]) => mockRunWorker(...args),
}));

const mockProcessExtractedText = vi.fn();
vi.mock('../../src/aurora/intake.js', () => ({
  processExtractedText: (...args: unknown[]) =>
    mockProcessExtractedText(...args),
}));

const mockWriteFile = vi.fn();
vi.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockProcessExtractedText.mockResolvedValue({
    documentNodeId: 'doc_batch123',
    chunkNodeIds: ['doc_batch123_chunk_0', 'doc_batch123_chunk_1'],
    title: 'Test Book',
    wordCount: 500,
    chunkCount: 5,
    crossRefsCreated: 2,
    crossRefMatches: [],
  });
  mockWriteFile.mockResolvedValue(undefined);
});

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

const { ingestImageBatch } = await import('../../src/aurora/ocr.js');

/* ------------------------------------------------------------------ */
/*  ingestImageBatch                                                   */
/* ------------------------------------------------------------------ */

describe('ingestImageBatch', () => {
  const workerSuccess = {
    ok: true,
    title: 'Test Book',
    text: '<!-- page 1 (page001.png) -->\n\nHello world',
    metadata: {
      source_type: 'batch_ocr',
      word_count: 2,
      page_count: 3,
      line_count: 5,
      avg_confidence: 0.892,
      language: 'en',
      ocr_engine: 'paddleocr',
      files: ['page001.png', 'page002.png', 'page003.png'],
    },
  };

  it('calls batch_ocr worker with folder path', async () => {
    mockRunWorker.mockResolvedValue(workerSuccess);

    await ingestImageBatch('/tmp/scans');

    expect(mockRunWorker).toHaveBeenCalledWith(
      {
        action: 'batch_ocr',
        source: expect.stringContaining('scans'),
        options: { language: 'en', title: undefined },
      },
      { timeout: 600_000 },
    );
  });

  it('passes language and title options', async () => {
    mockRunWorker.mockResolvedValue(workerSuccess);

    await ingestImageBatch('/tmp/scans', { language: 'sv', title: 'Min bok' });

    expect(mockRunWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { language: 'sv', title: 'Min bok' },
      }),
      expect.anything(),
    );
  });

  it('uses 10 min timeout', async () => {
    mockRunWorker.mockResolvedValue(workerSuccess);

    await ingestImageBatch('/tmp/scans');

    expect(mockRunWorker).toHaveBeenCalledWith(
      expect.anything(),
      { timeout: 600_000 },
    );
  });

  it('saves markdown to outputPath when set', async () => {
    mockRunWorker.mockResolvedValue(workerSuccess);

    await ingestImageBatch('/tmp/scans', { outputPath: '/tmp/output.md' });

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('output.md'),
      expect.stringContaining('# Test Book'),
      'utf-8',
    );
  });

  it('does not save when outputPath is omitted', async () => {
    mockRunWorker.mockResolvedValue(workerSuccess);

    await ingestImageBatch('/tmp/scans');

    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('returns pageCount, avgConfidence, files', async () => {
    mockRunWorker.mockResolvedValue(workerSuccess);

    const result = await ingestImageBatch('/tmp/scans');

    expect(result.pageCount).toBe(3);
    expect(result.avgConfidence).toBe(0.892);
    expect(result.files).toEqual(['page001.png', 'page002.png', 'page003.png']);
  });

  it('flows through processExtractedText', async () => {
    mockRunWorker.mockResolvedValue(workerSuccess);

    await ingestImageBatch('/tmp/scans', { scope: 'shared' });

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'Test Book',
      expect.stringContaining('page 1'),
      null,
      expect.objectContaining({ source_type: 'batch_ocr' }),
      expect.objectContaining({ scope: 'shared' }),
    );
  });

  it('throws on worker error', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'No image files found in: /tmp/empty',
    });

    await expect(ingestImageBatch('/tmp/empty')).rejects.toThrow(
      'No image files found',
    );
  });
});
