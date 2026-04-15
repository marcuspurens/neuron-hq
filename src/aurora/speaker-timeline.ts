/**
 * Pure module for building speaker timelines from whisper transcription
 * and diarization segments.
 */

/** A single word with timing from Whisper word_timestamps. */
export interface WhisperWord {
  start_ms: number;
  end_ms: number;
  word: string;
  /** Whisper confidence for this word (0–1). */
  probability?: number;
}

/** A segment from Whisper transcription. */
export interface WhisperSegment {
  start_ms: number;
  end_ms: number;
  text: string;
  /** Per-word timestamps (present when `word_timestamps=True` in Whisper). */
  words?: WhisperWord[];
}

/** A segment from speaker diarization. */
export interface DiarizationSegment {
  start_ms: number;
  end_ms: number;
  speaker: string;
}

/** A merged timeline block with speaker, time range, and text. */
export interface TimelineBlock {
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
}

/** Maximum lines per block before splitting. */
const MAX_LINES_PER_BLOCK = 7;

/**
 * Sentence-ending punctuation pattern.
 * Matches '.', '?', '!' optionally followed by closing quotes/parens.
 * Does not match abbreviations like "Dr." or "U.S." (single uppercase letter before dot).
 */
const SENTENCE_END = /[.?!][)»"']?\s+/g;

/**
 * Split a single WhisperSegment into sub-segments at sentence boundaries.
 * Time is distributed proportionally by character count within each sub-segment.
 *
 * If the segment contains no sentence boundaries (single sentence or no punctuation),
 * returns the original segment unchanged in a single-element array.
 */
export function splitAtSentenceBoundaries(
  segment: WhisperSegment,
): WhisperSegment[] {
  const text = segment.text.trim();
  if (text.length === 0) {
    return [segment];
  }

  // Find all sentence-boundary split points
  const sentences: string[] = [];
  let lastIndex = 0;

  // Reset regex state
  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_END.exec(text)) !== null) {
    // Include the punctuation + space in the preceding sentence
    const end = match.index + match[0].length;
    const sentence = text.slice(lastIndex, end).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    lastIndex = end;
  }

  // Remaining text after last sentence boundary
  const remainder = text.slice(lastIndex).trim();
  if (remainder.length > 0) {
    sentences.push(remainder);
  }

  // Single sentence or no splits found → return unchanged
  if (sentences.length <= 1) {
    return [segment];
  }

  // Distribute time proportionally by character count
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
  const duration = segment.end_ms - segment.start_ms;
  const subSegments: WhisperSegment[] = [];
  let currentStart = segment.start_ms;

  for (let i = 0; i < sentences.length; i++) {
    const proportion = sentences[i].length / totalChars;
    const subDuration = Math.round(duration * proportion);
    const subEnd =
      i === sentences.length - 1
        ? segment.end_ms // Last sub-segment snaps to original end
        : currentStart + subDuration;

    subSegments.push({
      start_ms: currentStart,
      end_ms: subEnd,
      text: sentences[i],
    });
    currentStart = subEnd;
  }

  return subSegments;
}

/**
 * Split a segment at diarization speaker-change boundaries using per-word timestamps.
 * Falls back to `splitAtSentenceBoundaries()` when the segment has no words.
 */
export function splitAtWordBoundaries(
  segment: WhisperSegment,
  diarizationSegments: DiarizationSegment[],
): WhisperSegment[] {
  const words = segment.words;
  if (!words || words.length === 0) {
    return splitAtSentenceBoundaries(segment);
  }

  if (diarizationSegments.length === 0) {
    return [segment];
  }

  // For each word, find the diarization speaker with most overlap
  const wordSpeakers = words.map((w) => {
    let bestSpeaker = 'UNKNOWN';
    let bestOverlap = 0;
    for (const dia of diarizationSegments) {
      const overlap = Math.max(
        0,
        Math.min(w.end_ms, dia.end_ms) - Math.max(w.start_ms, dia.start_ms),
      );
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = dia.speaker;
      }
    }
    return bestSpeaker;
  });

  // Group consecutive words with the same speaker into sub-segments
  const subSegments: WhisperSegment[] = [];
  let groupStart = 0;

  for (let i = 1; i <= words.length; i++) {
    if (i === words.length || wordSpeakers[i] !== wordSpeakers[groupStart]) {
      const groupWords = words.slice(groupStart, i);
      subSegments.push({
        start_ms: groupWords[0].start_ms,
        end_ms: groupWords[groupWords.length - 1].end_ms,
        text: groupWords.map((w) => w.word).join('').trim(),
        words: groupWords,
      });
      groupStart = i;
    }
  }

  return subSegments.length > 0 ? subSegments : [segment];
}

/**
 * Convert milliseconds to 'hh:mm:ss' format (floored to seconds).
 */
export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss}`;
}

/**
 * Calculate the overlap in milliseconds between two time ranges.
 * Returns 0 if they don't overlap.
 */
function computeOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  const overlapStart = Math.max(aStart, bStart);
  const overlapEnd = Math.min(aEnd, bEnd);
  return Math.max(0, overlapEnd - overlapStart);
}

/**
 * Find the diarization speaker with the most time overlap for a whisper segment.
 * Returns 'UNKNOWN' if no overlap is found.
 */
function assignSpeaker(
  whisper: WhisperSegment,
  diarization: DiarizationSegment[],
): string {
  let bestSpeaker = 'UNKNOWN';
  let bestOverlap = 0;

  for (const dia of diarization) {
    const overlap = computeOverlap(
      whisper.start_ms,
      whisper.end_ms,
      dia.start_ms,
      dia.end_ms,
    );
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestSpeaker = dia.speaker;
    }
  }

  return bestSpeaker;
}

/**
 * Split a text into lines (by newline). If only one "line" (no newlines),
 * approximate lines by counting words (~20 words per line).
 */
function countLines(text: string): number {
  const lines = text.split('\n');
  if (lines.length > 1) {
    return lines.length;
  }
  // Approximate: ~20 words per line
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 20));
}

/**
 * Split text into chunks of at most MAX_LINES_PER_BLOCK lines.
 * Splits on newlines first; if no newlines, splits by word count.
 */
function splitTextByLines(text: string): string[] {
  const lines = text.split('\n');

  if (lines.length > 1) {
    // Split actual newline-separated lines into groups
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += MAX_LINES_PER_BLOCK) {
      chunks.push(lines.slice(i, i + MAX_LINES_PER_BLOCK).join('\n'));
    }
    return chunks;
  }

  // No newlines: split by word count (~20 words/line, 7 lines = ~140 words)
  const wordsPerChunk = 20 * MAX_LINES_PER_BLOCK; // 140 words
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= wordsPerChunk) {
    return [text];
  }

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
  }
  return chunks;
}

/**
 * Build a speaker timeline from whisper and diarization segments.
 *
 * 1. Assign speakers to whisper segments based on maximum time overlap.
 * 2. Merge adjacent segments with the same speaker.
 * 3. Split blocks exceeding 7 lines (~150 words).
 * 4. Return sorted by start_ms.
 */
export function buildSpeakerTimeline(
  whisperSegments: WhisperSegment[],
  diarizationSegments: DiarizationSegment[],
): TimelineBlock[] {
  if (whisperSegments.length === 0) {
    return [];
  }

  // Sort whisper segments by start_ms
  const sorted = [...whisperSegments].sort((a, b) => a.start_ms - b.start_ms);

  // Step 0: Split segments at speaker-change boundaries.
  // Prefer word-level split (exact times) when words are available,
  // fall back to sentence-boundary heuristic otherwise.
  const hasWords = sorted.some((s) => s.words && s.words.length > 0);
  const fineSorted = hasWords
    ? sorted.flatMap((s) => splitAtWordBoundaries(s, diarizationSegments))
    : sorted.flatMap(splitAtSentenceBoundaries);

  // Step 1: Assign speaker to each whisper segment
  const assigned: TimelineBlock[] = fineSorted.map((ws) => ({
    speaker: assignSpeaker(ws, diarizationSegments),
    start_ms: ws.start_ms,
    end_ms: ws.end_ms,
    text: ws.text,
  }));

  // Step 2: Merge adjacent blocks with the same speaker
  const merged: TimelineBlock[] = [];
  for (const block of assigned) {
    const prev = merged[merged.length - 1];
    if (prev && prev.speaker === block.speaker) {
      prev.end_ms = Math.max(prev.end_ms, block.end_ms);
      prev.text = prev.text + ' ' + block.text;
    } else {
      merged.push({ ...block });
    }
  }

  // Step 3: Split blocks exceeding MAX_LINES_PER_BLOCK
  const result: TimelineBlock[] = [];
  for (const block of merged) {
    const lineCount = countLines(block.text);
    if (lineCount <= MAX_LINES_PER_BLOCK) {
      result.push(block);
    } else {
      const chunks = splitTextByLines(block.text);
      const duration = block.end_ms - block.start_ms;
      const chunkDuration = duration / chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        result.push({
          speaker: block.speaker,
          start_ms: Math.round(block.start_ms + i * chunkDuration),
          end_ms: Math.round(block.start_ms + (i + 1) * chunkDuration),
          text: chunks[i],
        });
      }
    }
  }

  // Step 4: Sort by start_ms (should already be sorted, but ensure it)
  result.sort((a, b) => a.start_ms - b.start_ms);

  return result;
}
