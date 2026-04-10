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
  processExtractedText: (...args: unknown[]) => mockProcessExtractedText(...args),
}));

const mockAnalyzeImage = vi.fn();
const mockIsVisionAvailable = vi.fn();
vi.mock('../../src/aurora/vision.js', () => ({
  analyzeImage: (...args: unknown[]) => mockAnalyzeImage(...args),
  isVisionAvailable: () => mockIsVisionAvailable(),
}));

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.clearAllMocks();
  mockProcessExtractedText.mockResolvedValue({
    documentNodeId: 'doc_abc123',
    chunkNodeIds: ['doc_abc123_chunk_0'],
    title: 'Test',
    wordCount: 10,
    chunkCount: 1,
    crossRefsCreated: 0,
    crossRefMatches: [],
  });
});

/* ------------------------------------------------------------------ */
/*  Import after mocks                                                 */
/* ------------------------------------------------------------------ */

const { ingestImage, ocrPdf, isTextGarbled, ingestPdfRich, diagnosePdfPage } =
  await import('../../src/aurora/ocr.js');

/* ------------------------------------------------------------------ */
/*  isTextGarbled                                                      */
/* ------------------------------------------------------------------ */

describe('isTextGarbled', () => {
  it('returns false for short text (< 50 chars)', () => {
    expect(isTextGarbled('hello world')).toBe(false);
    expect(isTextGarbled('')).toBe(false);
  });

  it('returns false for clean, well-formed text', () => {
    const clean =
      'This is a normal English sentence with proper formatting. ' +
      'It has multiple sentences to ensure we exceed the minimum length threshold.';
    expect(isTextGarbled(clean)).toBe(false);
  });

  it('returns true for text with garbled characters mid-word', () => {
    // Simulate garbled PDF text: digits/special chars inside words
    const words = [];
    for (let i = 0; i < 100; i++) {
      if (i % 10 === 0) {
        // 10% garbled words — well above the 3% threshold
        words.push('distribu:onen');
      } else {
        words.push('normal');
      }
    }
    expect(isTextGarbled(words.join(' '))).toBe(true);
  });

  it('returns false when suspicious ratio is below 3%', () => {
    // 1 garbled out of 100 words = 1%, below threshold
    const words = Array(99).fill('normal');
    words.push('distribu:onen');
    expect(isTextGarbled(words.join(' '))).toBe(false);
  });

  it('skips pure numbers, URLs, and dates', () => {
    const text =
      'The year 2024 is mentioned. Visit https://example.com for details. ' +
      'Date is 2024-03-15 and the budget is 12345. ' +
      'This is a perfectly normal document with enough words to exceed the minimum.';
    expect(isTextGarbled(text)).toBe(false);
  });

  it('detects Swedish garbled text patterns', () => {
    const words = [];
    for (let i = 0; i < 100; i++) {
      if (i % 8 === 0) {
        // ~12.5% garbled, well above threshold
        words.push('upprä3hålla');
      } else {
        words.push('standard');
      }
    }
    expect(isTextGarbled(words.join(' '))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  ingestImage                                                        */
/* ------------------------------------------------------------------ */

describe('ingestImage', () => {
  it('calls worker with extract_ocr action for supported image', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'photo',
      text: 'OCR result text',
      metadata: { source_type: 'text', word_count: 3 },
    });

    await ingestImage('photo.png');

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'extract_ocr',
      source: expect.stringContaining('photo.png'),
      options: { language: 'en' },
    });
  });

  it('passes language option to worker', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'photo',
      text: 'Résultat OCR',
      metadata: { source_type: 'text', word_count: 2 },
    });

    await ingestImage('photo.jpg', { language: 'fr' });

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'extract_ocr',
      source: expect.stringContaining('photo.jpg'),
      options: { language: 'fr' },
    });
  });

  it('rejects unsupported image types', async () => {
    await expect(ingestImage('document.pdf')).rejects.toThrow('Unsupported image type');
    await expect(ingestImage('archive.zip')).rejects.toThrow('Unsupported image type');
  });

  it('supports all declared image extensions', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'img',
      text: 'text',
      metadata: { source_type: 'text', word_count: 1 },
    });

    const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'];
    for (const ext of extensions) {
      await ingestImage(`file${ext}`);
    }
    expect(mockRunWorker).toHaveBeenCalledTimes(extensions.length);
  });

  it('throws on worker error', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'OCR engine not available',
    });

    await expect(ingestImage('photo.png')).rejects.toThrow('OCR engine not available');
  });

  it('calls processExtractedText with correct arguments', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'Scanned Doc',
      text: 'OCR extracted text here',
      metadata: { source_type: 'text', word_count: 4 },
    });

    await ingestImage('scan.png', { scope: 'shared' });

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'Scanned Doc',
      'OCR extracted text here',
      null,
      expect.objectContaining({
        source_type: 'text',
        word_count: 4,
        provenance: expect.objectContaining({
          agent: 'System',
          method: 'ocr',
          model: 'paddleocr-3.x',
        }),
      }),
      { scope: 'shared' }
    );
  });
});

/* ------------------------------------------------------------------ */
/*  ocrPdf                                                             */
/* ------------------------------------------------------------------ */

describe('ocrPdf', () => {
  it('calls worker with ocr_pdf action and default options', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'report',
      text: 'OCR PDF text',
      metadata: { source_type: 'pdf', word_count: 3 },
    });

    await ocrPdf('report.pdf');

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'ocr_pdf',
      source: expect.stringContaining('report.pdf'),
      options: { language: 'en', dpi: 200 },
    });
  });

  it('passes custom language and dpi options', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'rapport',
      text: 'Texte OCR',
      metadata: { source_type: 'pdf', word_count: 2 },
    });

    await ocrPdf('rapport.pdf', { language: 'fr', dpi: 300 });

    expect(mockRunWorker).toHaveBeenCalledWith({
      action: 'ocr_pdf',
      source: expect.stringContaining('rapport.pdf'),
      options: { language: 'fr', dpi: 300 },
    });
  });

  it('throws on worker error', async () => {
    mockRunWorker.mockResolvedValue({
      ok: false,
      error: 'PDF pages too large',
    });

    await expect(ocrPdf('huge.pdf')).rejects.toThrow('PDF pages too large');
  });

  it('calls processExtractedText with correct arguments', async () => {
    mockRunWorker.mockResolvedValue({
      ok: true,
      title: 'OCR Report',
      text: 'Full OCR text from PDF',
      metadata: { source_type: 'pdf', word_count: 5, page_count: 3 },
    });

    await ocrPdf('doc.pdf', { type: 'research' });

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'OCR Report',
      'Full OCR text from PDF',
      null,
      { source_type: 'pdf', word_count: 5, page_count: 3 },
      { type: 'research' }
    );
  });
});

/* ------------------------------------------------------------------ */
/*  ingestPdfRich — PageDigest                                         */
/* ------------------------------------------------------------------ */

describe('ingestPdfRich', () => {
  function setupPageCount(count: number) {
    mockRunWorker.mockImplementation(
      (req: { action: string; source?: string; options?: Record<string, unknown> }) => {
        if (req.action === 'get_pdf_page_count') {
          return { ok: true, metadata: { page_count: count } };
        }
        if (req.action === 'extract_pdf') {
          return { ok: true, text: 'Page one text\n\nPage two text', metadata: {} };
        }
        if (req.action === 'render_pdf_page') {
          return { ok: true, metadata: { output_path: `/tmp/page_${req.options?.page}.png` } };
        }
        return { ok: false, error: `Unexpected action: ${req.action}` };
      }
    );
  }

  it('produces PageDigest[] for clean PDF without vision', async () => {
    setupPageCount(2);
    mockIsVisionAvailable.mockResolvedValue(false);

    const result = await ingestPdfRich('/test/report.pdf');

    expect(result.pageDigests).toHaveLength(2);
    expect(result.pageDigests[0]).toEqual(
      expect.objectContaining({
        page: 1,
        textExtraction: expect.objectContaining({
          method: 'pypdfium2',
          garbled: false,
        }),
        ocrFallback: null,
        vision: null,
      })
    );
    expect(result.pageDigests[1]?.page).toBe(2);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.digest).toBe(result.pageDigests[0]);
    expect(result.pages[0]?.understanding).toBeDefined();
    expect(result.pages[0]?.understanding?.pageType).toBeDefined();

    expect(mockProcessExtractedText).toHaveBeenCalledWith(
      'report',
      expect.any(String),
      expect.stringContaining('report.pdf'),
      expect.objectContaining({
        source_type: 'pdf',
        pageDigests: expect.arrayContaining([
          expect.objectContaining({ page: 1 }),
          expect.objectContaining({ page: 2 }),
        ]),
        pages: expect.arrayContaining([
          expect.objectContaining({
            digest: expect.objectContaining({ page: 1 }),
            understanding: expect.objectContaining({ pageType: expect.any(String) }),
          }),
          expect.objectContaining({
            digest: expect.objectContaining({ page: 2 }),
            understanding: expect.objectContaining({ pageType: expect.any(String) }),
          }),
        ]),
      }),
      expect.any(Object)
    );
  });

  it('marks OCR fallback in PageDigest when text is garbled', async () => {
    const garbledWords: string[] = [];
    for (let i = 0; i < 100; i++) {
      garbledWords.push(i % 5 === 0 ? 'distribu:onen' : 'normal');
    }
    const garbledText = garbledWords.join(' ');

    mockRunWorker.mockImplementation((req: { action: string }) => {
      if (req.action === 'get_pdf_page_count') {
        return { ok: true, metadata: { page_count: 1 } };
      }
      if (req.action === 'extract_pdf') {
        return { ok: true, text: garbledText, metadata: {} };
      }
      if (req.action === 'ocr_pdf') {
        return { ok: true, text: 'Clean OCR text from page', metadata: {} };
      }
      return { ok: false, error: 'unexpected' };
    });
    mockIsVisionAvailable.mockResolvedValue(false);

    const result = await ingestPdfRich('/test/garbled.pdf');

    expect(result.pageDigests).toHaveLength(1);
    const digest = result.pageDigests[0]!;
    expect(digest.textExtraction.method).toBe('ocr');
    expect(digest.textExtraction.garbled).toBe(true);
    expect(digest.ocrFallback).toEqual(
      expect.objectContaining({
        triggered: true,
      })
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.understanding).toBeDefined();
  });

  it('records vision model and description in PageDigest', async () => {
    setupPageCount(1);
    mockIsVisionAvailable.mockResolvedValue(true);
    mockAnalyzeImage.mockResolvedValue({
      description: 'Table with 3 columns: Rank, Employer, Score',
      modelUsed: 'qwen3-vl:8b',
    });

    const result = await ingestPdfRich('/test/charts.pdf');

    expect(result.pageDigests).toHaveLength(1);
    const digest = result.pageDigests[0]!;
    expect(digest.vision).toEqual(
      expect.objectContaining({
        model: 'qwen3-vl:8b',
        description: 'Table with 3 columns: Rank, Employer, Score',
        textOnly: false,
        tokensEstimate: expect.any(Number),
      })
    );
    expect(result.visionUsed).toBe(true);

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.understanding).toBeDefined();
    expect(result.pages[0]?.understanding?.pageType).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  diagnosePdfPage                                                    */
/* ------------------------------------------------------------------ */

describe('diagnosePdfPage', () => {
  it('returns a valid PageDigest for a single page', async () => {
    mockRunWorker.mockImplementation(
      (req: { action: string; options?: Record<string, unknown> }) => {
        if (req.action === 'extract_pdf_docling') {
          return {
            ok: true,
            text: '## Page 3 heading\n\nSome content here.',
            metadata: {
              total_pages: 5,
              extracted_pages: 1,
              total_tables: 0,
              elapsed_ms: 100,
              pages: [
                {
                  page_no: 3,
                  markdown: '## Page 3 heading\n\nSome content here.',
                  char_count: 37,
                  tables: [],
                  table_count: 0,
                  image_count: 0,
                },
              ],
            },
          };
        }
        return { ok: false, error: 'unexpected' };
      }
    );
    mockIsVisionAvailable.mockResolvedValue(false);

    const digest = await diagnosePdfPage('/test/doc.pdf', 3);

    expect(digest.page).toBe(3);
    expect(digest.textExtraction.method).toBe('docling');
    expect(digest.textExtraction.text).toContain('Page 3 heading');
    expect(digest.textExtraction.garbled).toBe(false);
    expect(digest.ocrFallback).toBeNull();
    expect(digest.vision).toBeNull();
    expect(digest.combinedText).toContain('[Page 3]');
  });

  it('rejects out-of-range page numbers', async () => {
    mockRunWorker.mockImplementation(
      (req: { action: string; options?: Record<string, unknown> }) => {
        if (req.action === 'extract_pdf_docling') {
          return {
            ok: true,
            text: '',
            metadata: { total_pages: 3, extracted_pages: 0, pages: [] },
          };
        }
        return { ok: false, error: 'unexpected' };
      }
    );

    await expect(diagnosePdfPage('/test/doc.pdf', 0)).rejects.toThrow('out of range');
    await expect(diagnosePdfPage('/test/doc.pdf', 4)).rejects.toThrow('out of range');
  });
});
