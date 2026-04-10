/**
 * OCR module for Aurora: image text extraction and PDF OCR fallback.
 * Uses PaddleOCR via Python worker bridge.
 */

import { extname, resolve, basename } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { runWorker } from './worker-bridge.js';
import { processExtractedText, type IngestOptions, type IngestResult } from './intake.js';
import { analyzeImage, isVisionAvailable } from './vision.js';
import { classifyPage } from './page-classifier.js';
import type { AuroraPageEntry } from './types.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('aurora:ocr');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'];

/**
 * Ingest an image file via OCR.
 */
export async function ingestImage(
  filePath: string,
  options?: IngestOptions & { language?: string }
): Promise<IngestResult> {
  const ext = extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}. Supported: ${IMAGE_EXTENSIONS.join(', ')}`);
  }

  const absolutePath = resolve(filePath);
  const result = await runWorker({
    action: 'extract_ocr',
    source: absolutePath,
    options: { language: options?.language ?? 'en' },
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  const ocrMetadata = {
    ...(result.metadata as Record<string, unknown>),
    provenance: {
      agent: 'System',
      agentId: null,
      method: 'ocr',
      model: 'paddleocr-3.x',
      sourceId: null,
      timestamp: new Date().toISOString(),
    },
  };

  return processExtractedText(result.title, result.text, null, ocrMetadata, options ?? {});
}

/**
 * Re-extract text from a PDF using OCR (fallback for broken encoding).
 */
export async function ocrPdf(
  filePath: string,
  options?: IngestOptions & { language?: string; dpi?: number }
): Promise<IngestResult> {
  const absolutePath = resolve(filePath);
  const result = await runWorker({
    action: 'ocr_pdf',
    source: absolutePath,
    options: {
      language: options?.language ?? 'en',
      dpi: options?.dpi ?? 200,
    },
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return processExtractedText(
    result.title,
    result.text,
    null,
    result.metadata as Record<string, unknown>,
    options ?? {}
  );
}

/**
 * Detect if extracted PDF text is likely garbled (broken font encoding).
 * Heuristic: high ratio of unexpected characters in word positions.
 */
export function isTextGarbled(text: string): boolean {
  if (!text || text.length < 50) return false;
  // Count words that contain digits or special chars mid-word
  // (e.g., "upprä3hålla", "distribu:onen", "?ll")
  const words = text.split(/\s+/);
  let suspiciousCount = 0;
  for (const word of words) {
    // Skip pure numbers, URLs, dates
    if (/^\d+$/.test(word) || word.includes('://') || /^\d{4}-\d{2}/.test(word)) continue;
    // Flag: digit or ?:; inside an otherwise alphabetic word
    if (/[a-zåäöA-ZÅÄÖ][0-9?:;][a-zåäöA-ZÅÄÖ]/.test(word)) {
      suspiciousCount++;
    }
  }
  const ratio = suspiciousCount / words.length;
  return ratio > 0.03; // More than 3% suspicious words = likely garbled
}

/* ------------------------------------------------------------------ */
/*  Batch OCR                                                          */
/* ------------------------------------------------------------------ */

export interface BatchOcrOptions extends IngestOptions {
  /** OCR language hint. Default: 'en'. */
  language?: string;
  /** Custom document title. Default: folder name. */
  title?: string;
  /** Path to save combined markdown file. If omitted, no file is saved. */
  outputPath?: string;
}

export interface BatchOcrResult extends IngestResult {
  /** Number of pages (images) processed. */
  pageCount: number;
  /** Average OCR confidence across all pages. */
  avgConfidence: number;
  /** List of processed image filenames. */
  files: string[];
  /** Path where markdown was saved, if outputPath was set. */
  savedTo?: string;
}

/**
 * Batch-OCR a folder of images into a single document.
 * Images are sorted by filename (natural sort: page1, page2, page10).
 * Optionally saves the combined text as a markdown file.
 */
export async function ingestImageBatch(
  folderPath: string,
  options?: BatchOcrOptions
): Promise<BatchOcrResult> {
  const absolutePath = resolve(folderPath);
  const result = await runWorker(
    {
      action: 'batch_ocr',
      source: absolutePath,
      options: {
        language: options?.language ?? 'en',
        title: options?.title,
      },
    },
    { timeout: 600_000 }
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  const meta = result.metadata as Record<string, unknown>;

  // Optionally save markdown to disk
  let savedTo: string | undefined;
  if (options?.outputPath) {
    const outputAbsolute = resolve(options.outputPath);
    const header = `# ${result.title}\n\n`;
    await writeFile(outputAbsolute, header + result.text, 'utf-8');
    savedTo = outputAbsolute;
  }

  // Ingest into Aurora graph
  const ingestResult = await processExtractedText(
    result.title,
    result.text,
    null,
    meta,
    options ?? {}
  );

  return {
    ...ingestResult,
    pageCount: (meta.page_count as number) ?? 0,
    avgConfidence: (meta.avg_confidence as number) ?? 0,
    files: (meta.files as string[]) ?? [],
    savedTo,
  };
}

/* ------------------------------------------------------------------ */
/*  Rich PDF Ingest (OCR + Vision)                                     */
/* ------------------------------------------------------------------ */

export const PDF_VISION_PROMPT = `Analyze this PDF page.

If the page contains ONLY plain text with no visual elements, respond with exactly: TEXT_ONLY

Otherwise, describe the visual content:

1. PAGE TYPE: table / bar chart / line chart / pie chart / diagram / infographic / mixed
2. TITLE: The heading or title of this page, exactly as shown.
3. DATA: List ALL numbers, percentages, and labels visible. Preserve exact values.
   Format tables as: | Column1 | Column2 | ... |
   Format chart data as: Label: Value
4. KEY FINDING: One sentence summarizing the main takeaway of this page.
5. LANGUAGE: The language used in the document (e.g. Swedish, English).

Be precise with numbers. "67%" means 67%, not "about two-thirds".`;

/** Per-page diagnostic data from the PDF ingest pipeline. */
export interface PageDigest {
  /** 1-indexed page number. */
  page: number;
  textExtraction: {
    method: 'pypdfium2' | 'ocr' | 'docling' | 'none';
    text: string;
    charCount: number;
    garbled: boolean;
  };
  ocrFallback: {
    triggered: boolean;
    text: string | null;
    charCount: number | null;
  } | null;
  vision: {
    model: string;
    description: string;
    textOnly: boolean;
    tokensEstimate: number;
  } | null;
  combinedText: string;
  combinedCharCount: number;
}

export interface RichPdfResult extends IngestResult {
  pageDescriptions: string[];
  pageDigests: PageDigest[];
  /** Per-page digest + classifier understanding. */
  pages: AuroraPageEntry[];
  visionUsed: boolean;
  pageCount: number;
}

export async function ingestPdfRich(
  filePath: string,
  options?: IngestOptions & { language?: string; dpi?: number },
  onProgress?: (step: string, progress: number) => void
): Promise<RichPdfResult> {
  const absolutePath = resolve(filePath);
  const title = basename(filePath, extname(filePath));

  onProgress?.('extracting', 0);

  // Step 1: Get page count
  const pageCountResult = await runWorker({
    action: 'get_pdf_page_count',
    source: absolutePath,
  });
  if (!pageCountResult.ok) {
    throw new Error(`Failed to read PDF: ${pageCountResult.error}`);
  }
  const pageCount: number = pageCountResult.metadata.page_count as number;

  // Step 2: Extract text via pypdfium2
  const textResult = await runWorker({
    action: 'extract_pdf',
    source: absolutePath,
  });

  let extractedText: string = textResult.ok ? (textResult.text as string) : '';
  const garbled = isTextGarbled(extractedText);

  // Step 3: If garbled, fall back to OCR
  let ocrText: string | null = null;
  if (garbled || !extractedText.trim()) {
    onProgress?.('ocr', 10);
    try {
      const ocrResult = await runWorker(
        {
          action: 'ocr_pdf',
          source: absolutePath,
          options: {
            language: options?.language ?? 'en',
            dpi: options?.dpi ?? 150,
          },
        },
        { timeout: 600_000 }
      );
      if (ocrResult.ok) {
        ocrText = ocrResult.text as string;
        extractedText = ocrText;
      }
    } catch (err) {
      logger.warn('OCR fallback failed, using garbled text', { error: String(err) });
    }
  }

  onProgress?.('analyzing', 30);

  const textPages = extractedText.split(/\n{2,}/);
  const ocrPages = ocrText ? ocrText.split(/\n{2,}/) : null;

  // Step 4: Vision analysis per page (if Ollama available)
  const pageDescriptions: string[] = [];
  let visionUsed = false;
  const visionModels: (string | null)[] = [];

  const visionAvailable = await isVisionAvailable().catch(() => false);

  if (visionAvailable && pageCount > 0) {
    visionUsed = true;
    for (let i = 0; i < pageCount; i++) {
      const pct = 30 + Math.round((i / pageCount) * 50);
      onProgress?.('analyzing', pct);

      let tempImagePath: string | undefined;
      try {
        const renderResult = await runWorker({
          action: 'render_pdf_page',
          source: absolutePath,
          options: { page: i, dpi: options?.dpi ?? 150 },
        });
        if (!renderResult.ok) {
          throw new Error(renderResult.error);
        }
        tempImagePath = renderResult.metadata.output_path as string;

        const { description, modelUsed } = await analyzeImage(tempImagePath, {
          prompt: PDF_VISION_PROMPT,
        });

        if (description && !description.includes('TEXT_ONLY')) {
          pageDescriptions.push(description);
        } else {
          pageDescriptions.push('');
        }
        visionModels.push(modelUsed);
      } catch (err) {
        logger.warn(`Vision analysis failed for page ${i}`, { error: String(err) });
        pageDescriptions.push('');
        visionModels.push(null);
      } finally {
        if (tempImagePath) {
          await unlink(tempImagePath).catch(() => {});
        }
      }
    }
  }

  onProgress?.('chunking', 85);

  // Step 5: Build PageDigest[] and combine text + vision
  const pageDigests: PageDigest[] = [];
  const richParts: string[] = [];

  for (let i = 0; i < pageCount; i++) {
    const pageText = textPages[i] ?? '';
    const visionDesc = pageDescriptions[i] ?? '';
    const visionModel = visionModels[i] ?? null;

    let section = '';
    if (pageText.trim() || visionDesc) {
      section = `[Page ${i + 1}]\n${pageText.trim()}`;
      if (visionDesc) {
        section += `\n\n[Visual content: ${visionDesc}]`;
      }
      richParts.push(section);
    }

    const ocrTriggered = ocrText !== null;
    const ocrPageText = ocrPages?.[i] ?? null;

    const digest: PageDigest = {
      page: i + 1,
      textExtraction: {
        method: extractedText.trim() ? (ocrTriggered ? 'ocr' : 'pypdfium2') : 'none',
        text: truncateDigestText(pageText),
        charCount: pageText.length,
        garbled,
      },
      ocrFallback: ocrTriggered
        ? {
            triggered: true,
            text: ocrPageText ? truncateDigestText(ocrPageText) : null,
            charCount: ocrPageText?.length ?? null,
          }
        : null,
      vision:
        visionModel !== null
          ? {
              model: visionModel,
              description: truncateDigestText(visionDesc || 'TEXT_ONLY'),
              textOnly: !visionDesc,
              tokensEstimate: Math.ceil((visionDesc || '').length / 4),
            }
          : null,
      combinedText: truncateDigestText(section),
      combinedCharCount: section.length,
    };
    pageDigests.push(digest);
  }

  // Classify each page from its digest (sync, no LLM calls)
  const pages: AuroraPageEntry[] = pageDigests.map((d) => ({
    digest: d,
    understanding: classifyPage(d),
  }));

  const combinedText = richParts.length > 0 ? richParts.join('\n\n') : extractedText;

  onProgress?.('embedding', 90);

  // Step 6: Ingest into Aurora
  const ingestResult = await processExtractedText(
    title,
    combinedText,
    absolutePath,
    {
      source_type: visionUsed ? 'pdf_rich' : 'pdf',
      has_vision: visionUsed,
      page_count: pageCount,
      language: options?.language ?? 'unknown',
      word_count: combinedText.split(/\s+/).length,
      vision_pages: pageDescriptions.filter((d) => d.length > 0).length,
      pageDigests,
      pages,
    },
    options ?? {}
  );

  onProgress?.('done', 100);

  return {
    ...ingestResult,
    pageDescriptions,
    pageDigests,
    pages,
    visionUsed,
    pageCount,
  };
}

const MAX_DIGEST_TEXT_LENGTH = 2000;

function truncateDigestText(text: string): string {
  if (text.length <= MAX_DIGEST_TEXT_LENGTH) return text;
  return text.slice(0, MAX_DIGEST_TEXT_LENGTH - 3) + '...';
}

/* ------------------------------------------------------------------ */
/*  Single-page PDF Diagnostics                                        */
/* ------------------------------------------------------------------ */

export async function diagnosePdfPage(
  filePath: string,
  page: number,
  options?: { language?: string; dpi?: number; visionPrompt?: string }
): Promise<PageDigest> {
  const absolutePath = resolve(filePath);
  const dpi = options?.dpi ?? 150;

  // Step 1: Docling extracts structured markdown + tables for the target page.
  // This processes the whole PDF (~38s) but gives rich per-page output.
  const doclingResult = await runWorker(
    {
      action: 'extract_pdf_docling',
      source: absolutePath,
      options: { page },
    },
    { timeout: 300_000 }
  );

  if (!doclingResult.ok) {
    throw new Error(`Docling extraction failed: ${doclingResult.error}`);
  }

  const doclingMeta = doclingResult.metadata as Record<string, unknown>;
  const totalPages = doclingMeta.total_pages as number;
  if (page < 1 || page > totalPages) {
    throw new Error(`Page ${page} out of range (PDF has ${totalPages} pages)`);
  }

  const pagesArr = doclingMeta.pages as Array<{
    page_no: number;
    markdown: string;
    char_count: number;
    tables: Array<{
      columns: string[];
      rows: unknown[][];
      row_count: number;
      col_count: number;
      markdown: string;
    }>;
    table_count: number;
    image_count: number;
  }>;
  const pageData = pagesArr[0];
  if (!pageData) {
    throw new Error(`No data returned for page ${page}`);
  }

  const pageText = pageData.markdown;
  const hasImages = pageData.image_count > 0;

  // Step 2: Vision analysis — only for pages with images/diagrams that Docling
  // cannot parse (they show up as <!-- image --> in the markdown).
  let visionDesc = '';
  let visionModel: string | null = null;

  if (hasImages) {
    const visionAvailable = await isVisionAvailable().catch(() => false);
    if (visionAvailable) {
      let tempImagePath: string | undefined;
      try {
        const pageIndex = page - 1;
        const renderResult = await runWorker({
          action: 'render_pdf_page',
          source: absolutePath,
          options: { page: pageIndex, dpi },
        });
        if (renderResult.ok) {
          tempImagePath = renderResult.metadata.output_path as string;
          const { description, modelUsed } = await analyzeImage(tempImagePath, {
            prompt: options?.visionPrompt ?? PDF_VISION_PROMPT,
          });
          visionModel = modelUsed;
          if (description && !description.includes('TEXT_ONLY')) {
            visionDesc = description;
          }
        }
      } catch (err) {
        logger.warn(`Vision analysis failed for page ${page}`, { error: String(err) });
      } finally {
        if (tempImagePath) {
          await unlink(tempImagePath).catch(() => {});
        }
      }
    }
  }

  let combinedText = `[Page ${page}]\n${pageText.trim()}`;
  if (visionDesc) {
    combinedText += `\n\n[Visual content: ${visionDesc}]`;
  }

  return {
    page,
    textExtraction: {
      method: pageText.trim() ? 'docling' : 'none',
      text: pageText,
      charCount: pageText.length,
      garbled: false,
    },
    ocrFallback: null,
    vision:
      visionModel !== null
        ? {
            model: visionModel,
            description: visionDesc || 'TEXT_ONLY',
            textOnly: !visionDesc,
            tokensEstimate: Math.ceil(visionDesc.length / 4),
          }
        : null,
    combinedText,
    combinedCharCount: combinedText.length,
  };
}
