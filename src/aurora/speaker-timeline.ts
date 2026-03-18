/**
 * Pure module for building speaker timelines from whisper transcription
 * and diarization segments.
 */

/** A segment from Whisper transcription. */
export interface WhisperSegment {
  start_ms: number;
  end_ms: number;
  text: string;
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

  // Step 1: Assign speaker to each whisper segment
  const assigned: TimelineBlock[] = sorted.map((ws) => ({
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
