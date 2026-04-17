import type Anthropic from '@anthropic-ai/sdk';
import { loadAuroraGraph, saveAuroraGraph, updateAuroraNode } from './aurora-graph.js';
import { ensureOllama, getOllamaUrl } from '../core/ollama.js';
import { getConfig } from '../core/config.js';
import { createAgentClient } from '../core/agent-client.js';
import { DEFAULT_MODEL_CONFIG } from '../core/model-registry.js';
import type { AuroraNode } from './aurora-schema.js';

// --- Types ---

export interface PolishOptions {
  /** LLM backend to use. Default: 'ollama'. */
  polishModel?: 'ollama' | 'claude';
  /** Ollama model name. Default: env OLLAMA_MODEL_POLISH. */
  ollamaModel?: string;
  /** Number of segments per batch. Default: 8. */
  batchSize?: number;
}

export interface PolishResult {
  rawText: string;
  correctedText: string;
  batchCount: number;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
}

// --- System prompt ---

const SYSTEM_PROMPT = `You are a transcript editor. Fix spelling errors, proper nouns, technical terms, punctuation, and remove excessive filler words. Preserve the original meaning. Return ONLY the corrected text for each numbered segment, one per line, prefixed with the segment number.`;

// --- Helpers ---

/**
 * Split segments into batches of the given size.
 */
export function batchSegments<T>(segments: T[], batchSize: number = 8): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < segments.length; i += batchSize) {
    batches.push(segments.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Build the user message for a single batch.
 */
function buildUserMessage(
  batch: Array<{ text: string }>,
  context: { title: string; platform: string; prevSentence: string; nextSentence: string },
): string {
  const lines: string[] = [];
  lines.push(`Video title: ${context.title}`);
  lines.push(`Platform: ${context.platform}`);
  if (context.prevSentence) {
    lines.push(`Previous sentence: ${context.prevSentence}`);
  }
  lines.push('');
  lines.push('Segments to correct:');
  batch.forEach((seg, i) => {
    lines.push(`${i + 1}. ${seg.text}`);
  });
  if (context.nextSentence) {
    lines.push('');
    lines.push(`Next sentence: ${context.nextSentence}`);
  }
  return lines.join('\n');
}

/**
 * Parse LLM response lines into corrected segment texts.
 * Expects lines like "1. corrected text" or "1: corrected text".
 * Falls back to original text on parse failure.
 */
function parseResponse(response: string, batch: Array<{ text: string }>): string[] {
  const lines = response.split('\n').filter((l) => l.trim().length > 0);
  const result: string[] = new Array(batch.length);

  // Try to match numbered lines
  for (const line of lines) {
    const match = line.match(/^(\d+)[.:)]?\s*(.*)/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < batch.length) {
        result[idx] = match[2].trim();
      }
    }
  }

  // Fall back to original text for any missing segments
  for (let i = 0; i < batch.length; i++) {
    if (!result[i]) {
      result[i] = batch[i].text;
    }
  }

  return result;
}

// --- Core functions ---

/**
 * Send one batch of segments to an LLM for polishing.
 * Returns corrected text for each segment in the batch.
 */
export async function polishBatch(
  batch: Array<{ text: string }>,
  context: { title: string; platform: string; prevSentence: string; nextSentence: string },
  options?: PolishOptions,
): Promise<string[]> {
  const userMessage = buildUserMessage(batch, context);
  const backend = options?.polishModel ?? 'ollama';

  if (backend === 'claude') {
    const config = { ...DEFAULT_MODEL_CONFIG, model: 'claude-haiku-4-5-20251001' };
    const { client, model } = createAgentClient(config);

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return parseResponse(text, batch);
  }

  // Ollama path
  const ollamaModel = options?.ollamaModel ?? getConfig().OLLAMA_MODEL_POLISH;
  const baseUrl = getOllamaUrl();

  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      think: false,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama polish failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as OllamaChatResponse;
  return parseResponse(data.message.content, batch);
}

/**
 * Polish a transcript node's raw segments using an LLM.
 *
 * Loads the node from the Aurora graph, batches its rawSegments,
 * calls polishBatch for each batch, then saves correctedText on the node.
 */
export async function polishTranscript(
  nodeId: string,
  options?: PolishOptions,
): Promise<PolishResult> {
  const backend = options?.polishModel ?? 'ollama';

  // Ensure Ollama is available when using it
  if (backend === 'ollama') {
    const ollamaModel = options?.ollamaModel ?? getConfig().OLLAMA_MODEL_POLISH;
    const available = await ensureOllama(ollamaModel);
    if (!available) {
      throw new Error('Ollama not available — cannot polish transcript');
    }
  }

  // Load graph and find node
  let graph = await loadAuroraGraph();
  const node = graph.nodes.find((n: AuroraNode) => n.id === nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const rawSegments = node.properties.rawSegments as Array<{ text: string }>;
  if (!rawSegments || rawSegments.length === 0) {
    throw new Error(`Node ${nodeId} has no rawSegments`);
  }

  const title = node.title;
  const platform = (node.properties.platform as string) ?? 'unknown';
  const batchSize = options?.batchSize ?? 8;

  // Batch segments
  const batches = batchSegments(rawSegments, batchSize);
  const allCorrected: string[] = [];

  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Context: last segment of previous batch, first segment of next batch
    const prevBatch = i > 0 ? batches[i - 1] : null;
    const nextBatch = i < batches.length - 1 ? batches[i + 1] : null;
    const prevSentence = prevBatch ? prevBatch[prevBatch.length - 1].text : '';
    const nextSentence = nextBatch ? nextBatch[0].text : '';

    const corrected = await polishBatch(
      batch,
      { title, platform, prevSentence, nextSentence },
      options,
    );
    allCorrected.push(...corrected);
  }

  // Build texts
  const rawText = rawSegments.map((s) => s.text).join(' ');
  const correctedText = allCorrected.join(' ');

  // Update node: preserve rawText, set correctedText
  graph = updateAuroraNode(graph, nodeId, {
    properties: {
      ...node.properties,
      rawText,
      correctedText,
    },
  });
  await saveAuroraGraph(graph);

  return { rawText, correctedText, batchCount: batches.length };
}
