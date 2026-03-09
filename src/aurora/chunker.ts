/**
 * Pure TypeScript module that splits text into overlapping chunks
 * with sentence boundary detection.
 */

export interface ChunkOptions {
  maxWords?: number;    // default 200
  overlap?: number;     // default 20 (word overlap between chunks)
  minWords?: number;    // default 10 (filter out short chunks)
}

export interface Chunk {
  index: number;        // 0-based
  text: string;
  wordCount: number;
  startOffset: number;  // character position in original text
  endOffset: number;
}

const DEFAULT_MAX_WORDS = 200;
const DEFAULT_OVERLAP = 20;
const DEFAULT_MIN_WORDS = 10;

/** Check if a word ends with a sentence-terminating character. */
function isSentenceEnd(word: string): boolean {
  return /[.!?]$/.test(word);
}

/** Build a Chunk from a slice of word matches in the original text. */
function buildChunk(
  text: string,
  wordMatches: RegExpMatchArray[],
  fromIdx: number,
  toIdx: number,
  chunkIndex: number,
): Chunk {
  const firstMatch = wordMatches[fromIdx];
  const lastMatch = wordMatches[toIdx];
  const startOffset = firstMatch.index!;
  const endOffset = lastMatch.index! + lastMatch[0].length;
  return {
    index: chunkIndex,
    text: text.slice(startOffset, endOffset),
    wordCount: toIdx - fromIdx + 1,
    startOffset,
    endOffset,
  };
}

/**
 * Find the best end index for a chunk, preferring sentence boundaries.
 * Searches backward from `windowEndIdx` within the last 30% of the window.
 * Returns the chosen end index (inclusive).
 */
function findChunkEnd(
  wordMatches: RegExpMatchArray[],
  startIdx: number,
  windowEndIdx: number,
  maxWords: number,
): number {
  const searchStart = Math.floor(startIdx + maxWords * 0.7);
  for (let i = windowEndIdx; i >= searchStart; i--) {
    if (isSentenceEnd(wordMatches[i][0])) {
      return i;
    }
  }
  return windowEndIdx;
}

/**
 * Split text into overlapping chunks with sentence boundary detection.
 */
export function chunkText(text: string, options?: ChunkOptions): Chunk[] {
  const maxWords = options?.maxWords ?? DEFAULT_MAX_WORDS;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;
  const minWords = options?.minWords ?? DEFAULT_MIN_WORDS;

  // Step 1: empty/whitespace-only text → []
  const wordMatches = [...text.matchAll(/\S+/g)];
  if (wordMatches.length === 0) {
    return [];
  }

  // Step 3: all words fit in one chunk
  if (wordMatches.length <= maxWords) {
    const chunk = buildChunk(text, wordMatches, 0, wordMatches.length - 1, 0);
    return chunk.wordCount >= minWords ? [chunk] : [];
  }

  // Step 4: walk through words creating overlapping chunks
  const rawChunks: Chunk[] = [];
  let start = 0;
  const totalWords = wordMatches.length;

  while (start < totalWords) {
    const windowEnd = Math.min(start + maxWords, totalWords);
    let chunkEndIdx = windowEnd - 1;

    // Check if remaining words after this chunk would be too few
    const remaining = totalWords - windowEnd;
    const isLastChunk = remaining === 0 || remaining < minWords;

    if (isLastChunk) {
      // Extend this chunk to the end of text
      chunkEndIdx = totalWords - 1;
    } else {
      // Look for sentence boundary in last 30% of window
      chunkEndIdx = findChunkEnd(wordMatches, start, chunkEndIdx, maxWords);
    }

    rawChunks.push(
      buildChunk(text, wordMatches, start, chunkEndIdx, rawChunks.length),
    );

    if (isLastChunk) {
      break;
    }

    const actualChunkWords = chunkEndIdx - start + 1;
    const step = Math.max(1, actualChunkWords - overlap);
    start = start + step;
  }

  // Step 6: filter out any chunks with wordCount < minWords
  const filtered = rawChunks.filter((c) => c.wordCount >= minWords);

  // Step 7: reassign sequential indices
  return filtered.map((c, i) => ({ ...c, index: i }));
}
