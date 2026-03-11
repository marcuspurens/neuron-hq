/**
 * OCR module for Aurora: image text extraction and PDF OCR fallback.
 * Uses PaddleOCR via Python worker bridge.
 */

import { extname, resolve } from 'path';
import { runWorker } from './worker-bridge.js';
import { processExtractedText, type IngestOptions, type IngestResult } from './intake.js';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'];

/**
 * Ingest an image file via OCR.
 */
export async function ingestImage(
  filePath: string,
  options?: IngestOptions & { language?: string },
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
    options ?? {},
  );
}

/**
 * Re-extract text from a PDF using OCR (fallback for broken encoding).
 */
export async function ocrPdf(
  filePath: string,
  options?: IngestOptions & { language?: string; dpi?: number },
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
    options ?? {},
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
