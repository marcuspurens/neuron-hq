import { readFile, stat } from 'fs/promises';
import path from 'path';
import { extname, resolve, basename } from 'path';
import { processExtractedText, type IngestOptions, type IngestResult } from './intake.js';
import { isModelAvailable, getOllamaUrl } from '../core/ollama.js';
import { getConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('aurora:vision');

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

export interface VisionDiagnostics {
  model: string;
  loadDurationMs: number;
  evalDurationMs: number;
  totalDurationMs: number;
  promptTokens: number;
  evalTokens: number;
  imageSizeBytes: number;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp', '.gif'];

const _promptCache = new Map<string, string>();
async function loadPrompt(name: string): Promise<string> {
  let text = _promptCache.get(name);
  if (!text) {
    const p = path.resolve(import.meta.dirname ?? '.', `../../prompts/${name}.md`);
    text = await readFile(p, 'utf-8');
    _promptCache.set(name, text);
  }
  return text;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB safety limit

/**
 * Analyze an image using a local Ollama vision model.
 * Returns the generated description text and diagnostics.
 */
export async function analyzeImage(
  imagePath: string,
  options?: { prompt?: string; model?: string }
): Promise<{ description: string; modelUsed: string; diagnostics?: VisionDiagnostics }> {
  const absolutePath = resolve(imagePath);
  const ext = extname(absolutePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported image type: ${ext}. Supported: ${IMAGE_EXTENSIONS.join(', ')}`);
  }

  const fileStat = await stat(absolutePath);
  if (fileStat.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image too large: ${(fileStat.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`
    );
  }

  const imageBuffer = await readFile(absolutePath);
  const base64Image = imageBuffer.toString('base64');

  const baseUrl = getOllamaUrl();
  const model = options?.model ?? getConfig().OLLAMA_MODEL_VISION;
  const prompt = options?.prompt ?? await loadPrompt('vision-default');

  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: await loadPrompt('vision-system') },
        { role: 'user', content: prompt, images: [base64Image] },
      ],
      stream: false,
      think: false,
      keep_alive: '10m',
      options: { num_predict: 1200, temperature: 0 },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama vision failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as OllamaChatResponse;
  const content = data.message.content.trim();

  const diagnostics: VisionDiagnostics = {
    model,
    loadDurationMs: Math.round((data.load_duration ?? 0) / 1e6),
    evalDurationMs: Math.round((data.eval_duration ?? 0) / 1e6),
    totalDurationMs: Math.round((data.total_duration ?? 0) / 1e6),
    promptTokens: data.prompt_eval_count ?? 0,
    evalTokens: data.eval_count ?? 0,
    imageSizeBytes: fileStat.size,
  };

  logger.info('Vision analysis complete', {
    model,
    loadMs: diagnostics.loadDurationMs,
    evalMs: diagnostics.evalDurationMs,
    totalMs: diagnostics.totalDurationMs,
    promptTokens: diagnostics.promptTokens,
    evalTokens: diagnostics.evalTokens,
    imageSizeKB: Math.round(fileStat.size / 1024),
    contentLength: content.length,
  });

  return { description: content, modelUsed: model, diagnostics };
}

/**
 * Check if the vision model is available in Ollama.
 */
export async function isVisionAvailable(model?: string): Promise<boolean> {
  const modelName = model ?? getConfig().OLLAMA_MODEL_VISION;
  return isModelAvailable(modelName);
}

/**
 * Analyze an image and ingest the description into Aurora.
 */
export async function ingestImage(
  imagePath: string,
  options?: VisionOptions
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
      provenance: {
        agent: 'System',
        agentId: null,
        method: 'vision',
        model: modelUsed,
        sourceId: null,
        timestamp: new Date().toISOString(),
      },
    },
    options ?? {}
  );

  return {
    ...ingestResult,
    description,
    modelUsed,
  };
}
