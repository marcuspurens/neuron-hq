import type Anthropic from '@anthropic-ai/sdk';
import { loadAuroraGraph } from './aurora-graph.js';
import { ensureOllama, getOllamaUrl } from '../core/ollama.js';
import { getConfig } from '../core/config.js';
import { createAgentClient } from '../core/agent-client.js';
import { DEFAULT_MODEL_CONFIG } from '../core/model-registry.js';
import type { AuroraNode } from './aurora-schema.js';

// --- Types ---

export interface SpeakerGuess {
  speakerLabel: string;
  name: string;
  confidence: number;
  role: string;
  reason: string;
}

export interface SpeakerGuessOptions {
  model?: 'ollama' | 'claude';
  ollamaModel?: string;
}

export interface SpeakerGuessResult {
  guesses: SpeakerGuess[];
  modelUsed: string;
}

/** Context for a single speaker extracted from transcript + voice prints. */
export interface SpeakerContext {
  speakerLabel: string;
  sampleText: string;
  durationMs: number;
  segmentCount: number;
}

// --- Constants ---

const SYSTEM_PROMPT = `You are analyzing a video transcript to identify speakers. Based on the video title, channel, and transcript content, guess who each speaker is.

Return a JSON array with objects: { "speakerLabel": "SPEAKER_00", "name": "Full Name or empty string", "confidence": 0-100, "role": "description", "reason": "why you think this" }

Only return the JSON array, nothing else.`;

const MAX_SAMPLE_TEXT_LENGTH = 500;

// --- Public API ---

/**
 * Guess speaker identities for a transcript node using an LLM.
 *
 * Loads the transcript from the Aurora graph, finds linked voice prints,
 * builds context, and sends it to the configured LLM for identification.
 */
export async function guessSpeakers(
  nodeId: string,
  options?: SpeakerGuessOptions,
): Promise<SpeakerGuessResult> {
  const graph = await loadAuroraGraph();

  // Load transcript node
  const transcriptNode = graph.nodes.find((n) => n.id === nodeId);
  if (!transcriptNode) {
    throw new Error(`Transcript node not found: ${nodeId}`);
  }

  // Find voice_print nodes linked via derived_from edges
  const voicePrintIds = graph.edges
    .filter((e) => e.type === 'derived_from' && e.to === nodeId)
    .map((e) => e.from);

  const voicePrintNodes = graph.nodes.filter(
    (n) => voicePrintIds.includes(n.id) && n.type === 'voice_print',
  );

  // Build speaker context
  const speakerContexts = buildSpeakerContext(transcriptNode, voicePrintNodes);
  if (speakerContexts.length === 0) {
    return { guesses: [], modelUsed: 'none' };
  }

  // Build user message
  const userMessage = buildUserMessage(transcriptNode, speakerContexts);

  // Call LLM
  const modelChoice = options?.model ?? 'ollama';
  if (modelChoice === 'claude') {
    return callClaude(userMessage);
  }
  return callOllama(userMessage, options?.ollamaModel);
}

/**
 * Extract speaker context from a transcript node and its voice prints.
 *
 * For each unique speaker label in the voice prints, collects sample text
 * from the transcript's rawSegments. Falls back to a single-speaker context
 * if no voice prints are found but rawSegments contain text.
 */
export function buildSpeakerContext(
  transcriptNode: AuroraNode,
  voicePrintNodes: AuroraNode[],
): SpeakerContext[] {
  const rawSegments = transcriptNode.properties.rawSegments as
    | Array<{ speaker?: string; text?: string; start?: number; end?: number }>
    | undefined;

  if (voicePrintNodes.length === 0) {
    return buildSingleSpeakerFallback(rawSegments, transcriptNode);
  }

  // Group voice prints by speaker label (deduplicate)
  const seen = new Set<string>();
  const contexts: SpeakerContext[] = [];

  for (const vp of voicePrintNodes) {
    const label = (vp.properties.speakerLabel as string) || 'UNKNOWN';
    if (seen.has(label)) continue;
    seen.add(label);

    const durationMs = (vp.properties.totalDurationMs as number) || 0;
    const segmentCount = (vp.properties.segmentCount as number) || 0;

    // Collect sample text from rawSegments matching this speaker
    const sampleText = collectSampleText(rawSegments, label);

    contexts.push({ speakerLabel: label, sampleText, durationMs, segmentCount });
  }

  return contexts;
}

// --- Internal helpers ---

/** Collect sample text for a speaker from raw segments. */
function collectSampleText(
  rawSegments:
    | Array<{ speaker?: string; text?: string; start?: number; end?: number }>
    | undefined,
  speakerLabel: string,
): string {
  if (!rawSegments || !Array.isArray(rawSegments)) return '';

  let text = '';
  for (const seg of rawSegments) {
    if (seg.speaker === speakerLabel && seg.text) {
      text += seg.text + ' ';
      if (text.length >= MAX_SAMPLE_TEXT_LENGTH) break;
    }
  }
  return text.slice(0, MAX_SAMPLE_TEXT_LENGTH).trim();
}

/** Fallback for transcripts with no voice prints. */
function buildSingleSpeakerFallback(
  rawSegments:
    | Array<{ speaker?: string; text?: string; start?: number; end?: number }>
    | undefined,
  transcriptNode: AuroraNode,
): SpeakerContext[] {
  if (!rawSegments || !Array.isArray(rawSegments) || rawSegments.length === 0) {
    // Try properties.text as last resort
    const text = transcriptNode.properties.text as string | undefined;
    if (!text) return [];
    return [
      {
        speakerLabel: 'SPEAKER_00',
        sampleText: text.slice(0, MAX_SAMPLE_TEXT_LENGTH),
        durationMs: 0,
        segmentCount: 1,
      },
    ];
  }

  let combinedText = '';
  for (const seg of rawSegments) {
    if (seg.text) {
      combinedText += seg.text + ' ';
      if (combinedText.length >= MAX_SAMPLE_TEXT_LENGTH) break;
    }
  }

  if (!combinedText.trim()) return [];

  return [
    {
      speakerLabel: 'SPEAKER_00',
      sampleText: combinedText.slice(0, MAX_SAMPLE_TEXT_LENGTH).trim(),
      durationMs: 0,
      segmentCount: rawSegments.length,
    },
  ];
}

/** Build the user message from transcript and speaker contexts. */
function buildUserMessage(
  transcriptNode: AuroraNode,
  speakerContexts: SpeakerContext[],
): string {
  const title = transcriptNode.title || 'Unknown';
  const platform = (transcriptNode.properties.platform as string) || 'Unknown';

  const speakerLines = speakerContexts
    .map(
      (sc) =>
        `${sc.speakerLabel} (spoke for ${sc.durationMs}ms, ${sc.segmentCount} segments):\nSample text: "${sc.sampleText}"`,
    )
    .join('\n\n');

  return `Video title: ${title}\nPlatform/Channel: ${platform}\n\nSpeakers found in transcript:\n\n${speakerLines}`;
}

/** Parse the LLM response into validated SpeakerGuess objects. */
function parseGuesses(responseText: string): SpeakerGuess[] {
  let parsed: unknown;

  // Try direct JSON parse
  try {
    parsed = JSON.parse(responseText);
  } catch {  /* intentional: parse may fail */
    // Try to extract JSON array with regex
    const match = responseText.match(/\[.*\]/s);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {  /* intentional: parse may fail */
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      speakerLabel: typeof item.speakerLabel === 'string' ? item.speakerLabel : 'UNKNOWN',
      name: typeof item.name === 'string' ? item.name : '',
      confidence: typeof item.confidence === 'number' ? item.confidence : 0,
      role: typeof item.role === 'string' ? item.role : '',
      reason: typeof item.reason === 'string' ? item.reason : '',
    }));
}

/** Call Ollama for speaker guessing. */
async function callOllama(
  userMessage: string,
  ollamaModel?: string,
): Promise<SpeakerGuessResult> {
  const model = ollamaModel ?? getConfig().OLLAMA_MODEL_POLISH;
  await ensureOllama(model);

  const baseUrl = getOllamaUrl();
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      stream: false,
      format: 'json',
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama chat failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  const content = data.message?.content ?? '';

  return { guesses: parseGuesses(content), modelUsed: model };
}

/** Call Claude/Anthropic for speaker guessing. */
async function callClaude(userMessage: string): Promise<SpeakerGuessResult> {
  const config = {
    ...DEFAULT_MODEL_CONFIG,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
  };

  const { client, model } = createAgentClient(config);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return { guesses: parseGuesses(content), modelUsed: model };
}
