import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock worker-bridge
const mockIsWorkerAvailable = vi.fn();
vi.mock('../../src/aurora/worker-bridge.js', () => ({
  isWorkerAvailable: () => mockIsWorkerAvailable(),
}));

// Mock OCR module
const mockOcrPdf = vi.fn();
vi.mock('../../src/aurora/ocr.js', () => ({
  ocrPdf: (...args: unknown[]) => mockOcrPdf(...args),
}));

import { auroraOcrPdfCommand } from '../../src/commands/aurora-ocr-pdf.js';

describe('aurora:ocr-pdf command', () => {
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(() => {
    mockIsWorkerAvailable.mockReset();
    mockOcrPdf.mockReset();
    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    });
  });

  it('shows OCR result for PDF', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockOcrPdf.mockResolvedValue({
      documentNodeId: 'doc_pdf123',
      chunkNodeIds: ['doc_pdf123_chunk_0'],
      title: 'report',
      wordCount: 500,
      chunkCount: 6,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    await auroraOcrPdfCommand('report.pdf', {});

    const output = consoleOutput.join('\n');
    expect(output).toContain('Extracted');
    expect(output).toContain('report');
    expect(output).toContain('500');
  });

  it('passes dpi option to worker', async () => {
    mockIsWorkerAvailable.mockResolvedValue(true);
    mockOcrPdf.mockResolvedValue({
      documentNodeId: 'doc_pdf123',
      chunkNodeIds: [],
      title: 'test',
      wordCount: 10,
      chunkCount: 1,
      crossRefsCreated: 0,
      crossRefMatches: [],
    });

    await auroraOcrPdfCommand('test.pdf', { dpi: '300', language: 'sv' });

    expect(mockOcrPdf).toHaveBeenCalledWith(
      'test.pdf',
      expect.objectContaining({ dpi: 300, language: 'sv' }),
    );
  });
});
