import { readFile } from 'fs/promises';
import { extname, resolve, basename } from 'path';
import { processExtractedText, type IngestOptions, type IngestResult } from './intake.js';
import { ensureOllama, getOllamaUrl } from '../core/ollama.js';
import { getConfig } from '../core/config.js';

// --- Types ---

export interface VisionOptions extends IngestOptions {
  /** Custom prompt for the vision model. */
  prompt?: string;
  /** Ollama model to use. Default: env OLLAMA_MODEL_VISION. */
  model?: string;
  /** Custom document title. Default: filename. */
  title?: string;
}

export interface VisionResult extends IngestResult {
  /** The generated image description. */
  description: string;
  /** Model used for analysis. */
  modelUsed: string;
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp', '.gif'];

const DEFAULT_PROMPT = `Describe this image in detail for indexing in a knowledge graph.
Include: subjects, objects, text visible in the image, colors, layout, and context.
If the image contains a diagram or chart, describe its structure and data.
If the image contains text, transcribe all visible text.
Be factual and precise — do not speculate or hallucinate.`;

/**
 * Analyze an image using a local Ollama vision model.
 * Returns the generated description text.
 */
export async function analyzeImage(
  imagePath: string,
  options?: { prompt?: string; model?: string },
): Promise<{ description: string; modelUsed: string }> {
  const absolutePath = resolve(imagePath);
  const ext = extname(absolutePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}. Supported: ${IMAGE_EXTENSIONS.join(', ')}`);
  }

  const imageBuffer = await readFile(absolutePath);
  const base64Image = imageBuffer.toString('base64');

  const baseUrl = getOllamaUrl();
  const model = options?.model ?? getConfig().OLLAMA_MODEL_VISION;
  const prompt = options?.prompt ?? DEFAULT_PROMPT;

  await ensureOllama(model);

  const resp = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      images: [base64Image],
      stream: false,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama vision failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as OllamaGenerateResponse;
  return { description: data.response, modelUsed: model };
}

/**
 * Check if the vision model is available in Ollama.
 */
export async function isVisionAvailable(model?: string): Promise<boolean> {
  const modelName = model ?? getConfig().OLLAMA_MODEL_VISION;
  return ensureOllama(modelName);
}

/**
 * Analyze an image and ingest the description into Aurora.
 */
export async function ingestImage(
  imagePath: string,
  options?: VisionOptions,
): Promise<VisionResult> {
  const { description, modelUsed } = await analyzeImage(imagePath, {
    prompt: options?.prompt,
    model: options?.model,
  });

  const title = options?.title ?? basename(imagePath);
  const words = description.split(/\s+/);

  const ingestResult = await processExtractedText(
    title,
    description,
    null,
    {
      source_type: 'vision',
      word_count: words.length,
      model_used: modelUsed,
      image_path: resolve(imagePath),
    },
    options ?? {},
  );

  return {
    ...ingestResult,
    description,
    modelUsed,
  };
}
