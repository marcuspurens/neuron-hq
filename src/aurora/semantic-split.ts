import path from 'path';
import fs from 'fs/promises';
import { ensureOllama, getOllamaUrl } from '../core/ollama.js';
import { getConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import type { TimelineBlock, WhisperWord } from './speaker-timeline.js';

const logger = createLogger('aurora:semantic-split');

const _promptCache = new Map<string, string>();
async function loadPrompt(name: string): Promise<string> {
  let text = _promptCache.get(name);
  if (!text) {
    const p = path.resolve(import.meta.dirname ?? '.', `../../prompts/${name}.md`);
    text = await fs.readFile(p, 'utf-8');
    _promptCache.set(name, text);
  }
  return text;
}

const MAX_TEXT_CHARS = 12000;

export interface SemanticSplitOptions {
  ollamaModel?: string;
}

/**
 * Split a timeline block into semantically coherent paragraphs using Ollama.
 * Preserves speaker, distributes words to the correct sub-block.
 * Returns the original block unchanged if Ollama is unavailable or fails.
 */
export async function semanticSplitBlock(
  block: TimelineBlock,
  options?: SemanticSplitOptions,
): Promise<TimelineBlock[]> {
  const text = block.text;
  if (text.length < 200) return [block];

  let splitPoints: number[];
  try {
    splitPoints = await getSplitPointsOllama(text.slice(0, MAX_TEXT_CHARS), options?.ollamaModel);
  } catch (err) {
    logger.warn('Semantic split failed, keeping block intact', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [block];
  }

  logger.info('Split points for block', {
    textLen: text.length,
    points: splitPoints.length,
    splitPoints: splitPoints.slice(0, 10),
  });

  if (splitPoints.length === 0) return [block];

  return applyCharSplitPoints(block, splitPoints);
}

/**
 * Apply character-index split points to a timeline block.
 * Distributes time proportionally and assigns words to sub-blocks.
 */
export function applyCharSplitPoints(
  block: TimelineBlock,
  splitPoints: number[],
): TimelineBlock[] {
  const text = block.text;
  const allPoints = [0, ...splitPoints.filter((p) => p > 0 && p < text.length), text.length];
  const subBlocks: TimelineBlock[] = [];

  // Build a character-position → word index map for accurate word distribution
  const wordRanges: Array<{ charStart: number; charEnd: number; wordIdx: number }> = [];
  if (block.words) {
    let cursor = 0;
    for (let wi = 0; wi < block.words.length; wi++) {
      const w = block.words[wi];
      const idx = text.indexOf(w.word, cursor);
      if (idx >= 0) {
        wordRanges.push({ charStart: idx, charEnd: idx + w.word.length, wordIdx: wi });
        cursor = idx + w.word.length;
      }
    }
  }

  for (let i = 0; i < allPoints.length - 1; i++) {
    const charStart = allPoints[i];
    const charEnd = allPoints[i + 1];
    const subText = text.slice(charStart, charEnd).trim();
    if (subText.length === 0) continue;

    let subWords: WhisperWord[] | undefined;
    if (block.words && wordRanges.length > 0) {
      subWords = wordRanges
        .filter((wr) => wr.charStart >= charStart && wr.charStart < charEnd)
        .map((wr) => block.words![wr.wordIdx]);
      if (subWords.length === 0) subWords = undefined;
    }

    const subStartMs = subWords?.[0]?.start_ms
      ?? Math.round(block.start_ms + (charStart / text.length) * (block.end_ms - block.start_ms));
    const subEndMs = subWords?.[subWords.length - 1]?.end_ms
      ?? Math.round(block.start_ms + (charEnd / text.length) * (block.end_ms - block.start_ms));

    subBlocks.push({
      speaker: block.speaker,
      start_ms: subStartMs,
      end_ms: subEndMs,
      text: subText,
      words: subWords,
    });
  }

  return subBlocks.length > 0 ? subBlocks : [block];
}

/**
 * Apply semantic splitting to all blocks in a timeline.
 * Blocks shorter than 200 chars are left intact.
 */
const MIN_BLOCK_CHARS = 80;

export async function semanticSplitTimeline(
  blocks: TimelineBlock[],
  options?: SemanticSplitOptions,
): Promise<TimelineBlock[]> {
  const split: TimelineBlock[] = [];
  for (const block of blocks) {
    const sub = await semanticSplitBlock(block, options);
    split.push(...sub);
  }
  return mergeRunts(split);
}

const MAX_RUNT_GAP_MS = 10_000;

function mergeRunts(blocks: TimelineBlock[]): TimelineBlock[] {
  const result: TimelineBlock[] = [];
  for (const block of blocks) {
    const prev = result[result.length - 1];
    const adjacent = prev
      && prev.speaker === block.speaker
      && (block.start_ms - prev.end_ms) < MAX_RUNT_GAP_MS;
    if (adjacent && block.text.length < MIN_BLOCK_CHARS) {
      prev.end_ms = Math.max(prev.end_ms, block.end_ms);
      prev.text = prev.text + ' ' + block.text;
      if (block.words) {
        prev.words = [...(prev.words ?? []), ...block.words];
      }
    } else {
      result.push({ ...block, words: block.words ? [...block.words] : undefined });
    }
  }
  return result;
}

function splitIntoSentences(text: string): Array<{ text: string; charStart: number }> {
  const re = /[.?!][)»"']?\s+/g;
  const sentences: Array<{ text: string; charStart: number }> = [];
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const sentEnd = m.index + m[0].length;
    sentences.push({ text: text.slice(lastEnd, sentEnd).trim(), charStart: lastEnd });
    lastEnd = sentEnd;
  }
  if (lastEnd < text.length) {
    sentences.push({ text: text.slice(lastEnd).trim(), charStart: lastEnd });
  }
  return sentences.filter((s) => s.text.length > 0);
}

async function getSplitPointsOllama(
  text: string,
  ollamaModel?: string,
): Promise<number[]> {
  const model = ollamaModel ?? getConfig().OLLAMA_MODEL_POLISH;
  await ensureOllama(model);

  const sentences = splitIntoSentences(text);
  if (sentences.length < 3) return [];

  const numbered = sentences
    .map((s, i) => `[${i + 1}] ${s.text}`)
    .join(' ');

  const baseUrl = getOllamaUrl();
  const resp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: await loadPrompt('semantic-split') },
        { role: 'user', content: numbered },
      ],
      stream: false,
      format: 'json',
      think: false,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama chat failed (${resp.status}): ${body}`);
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  const content = (data.message?.content ?? '').trim();

  logger.info('Semantic split response', { model, length: content.length, raw: content.slice(0, 300), sentenceCount: sentences.length });

  const sentenceNums = parseSentenceNumbers(content, sentences.length);
  return sentenceNums
    .map((n) => sentences[n - 1]?.charStart)
    .filter((v): v is number => v !== undefined && v > 0);
}



const TARGET_CHAPTERS_MIN = 3;
const TARGET_CHAPTERS_MAX = 8;
const CHAPTER_SAMPLE_CHARS = 600;

export interface GeneratedChapter {
  start_time: number;
  title: string;
}

export async function generateChapterTitles(
  blocks: TimelineBlock[],
  options?: SemanticSplitOptions,
): Promise<GeneratedChapter[]> {
  if (blocks.length < 2) return [];

  const groups = groupBlocksIntoChapters(blocks);
  if (groups.length < 2) return [];

  const excerpts = groups
    .map((g, i) => {
      const text = g.map((b) => b.text).join(' ').slice(0, CHAPTER_SAMPLE_CHARS);
      return `[${i + 1}] ${text}`;
    })
    .join('\n\n');

  const model = options?.ollamaModel ?? getConfig().OLLAMA_MODEL_POLISH;

  try {
    await ensureOllama(model);
  } catch {
    return [];
  }

  const baseUrl = getOllamaUrl();
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: await loadPrompt('chapter-titles') },
          { role: 'user', content: excerpts },
        ],
        stream: false,
        format: 'json',
        think: false,
      }),
    });
  } catch (err) {
    logger.warn('Chapter title generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  if (!resp.ok) {
    logger.warn('Chapter title Ollama call failed', { status: resp.status });
    return [];
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  const content = (data.message?.content ?? '').trim();

  logger.info('Chapter title response', { length: content.length, raw: content.slice(0, 300) });

  const titles = parseChapterTitles(content);
  if (titles.length !== groups.length) {
    logger.warn('Title count mismatch', { expected: groups.length, got: titles.length });
    return [];
  }

  return groups.map((g, i) => ({
    start_time: g[0].start_ms / 1000,
    title: titles[i],
  }));
}

export function groupBlocksIntoChapters(blocks: TimelineBlock[]): TimelineBlock[][] {
  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
  const targetGroups = Math.min(
    TARGET_CHAPTERS_MAX,
    Math.max(TARGET_CHAPTERS_MIN, Math.round(totalChars / 2000)),
  );
  const charsPerGroup = Math.ceil(totalChars / targetGroups);

  const groups: TimelineBlock[][] = [];
  let current: TimelineBlock[] = [];
  let currentChars = 0;

  for (const block of blocks) {
    current.push(block);
    currentChars += block.text.length;
    if (currentChars >= charsPerGroup && groups.length < targetGroups - 1) {
      groups.push(current);
      current = [];
      currentChars = 0;
    }
  }
  if (current.length > 0) groups.push(current);

  return groups;
}

export function parseChapterTitles(raw: string): string[] {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    let arr: unknown[] | null = null;
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const values = Object.values(parsed as Record<string, unknown>);
      arr = values.find((v) => Array.isArray(v)) as unknown[] | undefined ?? null;
    }
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .map((s) => s.slice(0, 80));
  } catch {
    logger.warn('Failed to parse chapter titles', { raw: raw.slice(0, 200) });
  }
  return [];
}



const MAX_TOPIC_TAGS = 20;

/**
 * Generate topic tags from a video's title and TL;DR using Ollama.
 * Returns [] on any failure (Ollama down, parse error, etc).
 */
export async function generateTopicTags(
  title: string,
  tldr: string,
  existingTags: string[],
  ollamaModel?: string,
): Promise<string[]> {
  if (!title && !tldr) return [];

  const model = ollamaModel ?? getConfig().OLLAMA_MODEL_POLISH;

  try {
    await ensureOllama(model);
  } catch {
    return [];
  }

  const baseUrl = getOllamaUrl();
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: await loadPrompt('topic-tags') },
          { role: 'user', content: `Title: ${title}\nSummary: ${tldr}` },
        ],
        stream: false,
        format: 'json',
        think: false,
      }),
    });
  } catch (err) {
    logger.warn('Topic tag generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }

  if (!resp.ok) {
    logger.warn('Topic tag Ollama call failed', { status: resp.status });
    return [];
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  const content = (data.message?.content ?? '').trim();

  logger.info('Topic tag response', { length: content.length, raw: content.slice(0, 300) });

  const generated = parseTopicTags(content);
  return mergeTopicTags(generated, existingTags);
}

/**
 * Parse LLM response into topic tag strings.
 * Handles JSON arrays, object wrappers, and code fences.
 */
export function parseTopicTags(raw: string): string[] {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    let arr: unknown[] | null = null;
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const values = Object.values(parsed as Record<string, unknown>);
      arr = values.find((v) => Array.isArray(v)) as unknown[] | undefined ?? null;
    }
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((s) => s.toLowerCase().trim().slice(0, 60));
  } catch {
    logger.warn('Failed to parse topic tags', { raw: raw.slice(0, 200) });
  }
  return [];
}

/**
 * Merge generated tags with existing tags. Deduplicate (lowercase), cap at MAX_TOPIC_TAGS.
 */
export function mergeTopicTags(generated: string[], existing: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  // Existing tags first (preserve order)
  for (const tag of existing) {
    const key = tag.toLowerCase().trim();
    if (key.length > 0 && !seen.has(key)) {
      seen.add(key);
      merged.push(key);
    }
  }

  // Then generated tags
  for (const tag of generated) {
    const key = tag.toLowerCase().trim();
    if (key.length > 0 && !seen.has(key)) {
      seen.add(key);
      merged.push(key);
    }
  }

  return merged.slice(0, MAX_TOPIC_TAGS);
}

function parseSentenceNumbers(raw: string, maxSentence: number): number[] {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    let arr: unknown[] | null = null;
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const values = Object.values(parsed as Record<string, unknown>);
      arr = values.find((v) => Array.isArray(v)) as unknown[] | undefined ?? null;
    }
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is number => typeof v === 'number' && v > 1 && v <= maxSentence)
      .sort((a, b) => a - b);
  } catch {
    logger.warn('Failed to parse sentence numbers', { raw: raw.slice(0, 200) });
  }
  return [];
}


