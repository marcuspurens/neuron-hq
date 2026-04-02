/**
 * OCR module for Aurora: image text extraction and PDF OCR fallback.
 * Uses PaddleOCR via Python worker bridge.
 */

import { extname, resolve, basename } from 'path';
import { writeFile, unlink } from 'fs/promises';
import { runWorker } from './worker-bridge.js';
import { processExtractedText, type IngestOptions, type IngestResult } from './intake.js';
import { analyzeImage, isVisionAvailable } from './vision.js';
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

  return processExtractedText(
    result.title,
    result.text,
    null,
    result.metadata as Record<string, unknown>,
    options ?? {}
  );
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

const PDF_VISION_PROMPT =
  'Describe this PDF page. If it contains tables, describe the table structure and key data. ' +
  'If it contains charts, graphs or diagrams, describe what they show and the key data points. ' +
  'If it only contains plain text, respond with exactly: TEXT_ONLY';

export interface RichPdfResult extends IngestResult {
  pageDescriptions: string[];
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
        extractedText = ocrResult.text as string;
      }
    } catch (err) {
      logger.warn('OCR fallback failed, using garbled text', { error: String(err) });
    }
  }

  onProgress?.('analyzing', 30);

  // Step 4: Vision analysis per page (if Ollama available)
  const pageDescriptions: string[] = [];
  let visionUsed = false;

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

        const { description } = await analyzeImage(tempImagePath, {
          prompt: PDF_VISION_PROMPT,
        });

        if (description && !description.includes('TEXT_ONLY')) {
          pageDescriptions.push(description);
        } else {
          pageDescriptions.push('');
        }
      } catch (err) {
        logger.warn(`Vision analysis failed for page ${i}`, { error: String(err) });
        pageDescriptions.push('');
      } finally {
        if (tempImagePath) {
          await unlink(tempImagePath).catch(() => {});
        }
      }
    }
  }

  onProgress?.('chunking', 85);

  // Step 5: Combine text + vision into rich document
  const richParts: string[] = [];
  const textPages = extractedText.split(/\n{2,}/);

  for (let i = 0; i < pageCount; i++) {
    const pageText = textPages[i] ?? '';
    const visionDesc = pageDescriptions[i] ?? '';

    if (pageText.trim() || visionDesc) {
      let section = `[Page ${i + 1}]\n${pageText.trim()}`;
      if (visionDesc) {
        section += `\n\n[Visual content: ${visionDesc}]`;
      }
      richParts.push(section);
    }
  }

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
    },
    options ?? {}
  );

  onProgress?.('done', 100);

  return {
    ...ingestResult,
    pageDescriptions,
    visionUsed,
    pageCount,
  };
}
