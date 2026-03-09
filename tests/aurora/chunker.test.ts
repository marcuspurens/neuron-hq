import { describe, it, expect } from 'vitest';
import { chunkText } from '../../src/aurora/chunker.js';
import type { ChunkOptions } from '../../src/aurora/chunker.js';

describe('chunkText', () => {
  describe('empty and whitespace input', () => {
    it('returns empty array for empty string', () => {
      expect(chunkText('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(chunkText('   \n\t  ')).toEqual([]);
    });

    it('returns empty array for only newlines', () => {
      expect(chunkText('\n\n\n')).toEqual([]);
    });
  });

  describe('short text (fewer words than maxWords)', () => {
    it('returns single chunk for short text', () => {
      const text = 'Hello world this is a test.';
      const chunks = chunkText(text, { maxWords: 10, minWords: 1 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].wordCount).toBe(6);
    });

    it('returns empty array when word count is below minWords', () => {
      expect(chunkText('hello world', { minWords: 5 })).toEqual([]);
    });

    it('returns single chunk when text has exactly one word', () => {
      const chunks = chunkText('Hello', { maxWords: 200, minWords: 1 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Hello');
      expect(chunks[0].wordCount).toBe(1);
    });
  });

  describe('text with exactly maxWords', () => {
    it('returns one chunk when word count equals maxWords', () => {
      const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 1 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].wordCount).toBe(20);
    });
  });

  describe('long text produces multiple chunks', () => {
    const longText = Array.from({ length: 50 }, (_, i) =>
      `Sentence number ${i + 1} has some words in it.`
    ).join(' ');

    it('creates multiple chunks for long text', () => {
      const chunks = chunkText(longText, { maxWords: 20, overlap: 5, minWords: 3 });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('chunks have sequential 0-based indices', () => {
      const chunks = chunkText(longText, { maxWords: 20, overlap: 5, minWords: 3 });
      chunks.forEach((c, i) => {
        expect(c.index).toBe(i);
      });
    });

    it('chunks overlap by the configured amount', () => {
      // Use text without sentence boundaries so chunks are exactly maxWords
      const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const opts: ChunkOptions = { maxWords: 20, overlap: 5, minWords: 3 };
      const chunks = chunkText(text, opts);

      // Verify overlapping: first words of chunk[n] should include
      // last words of chunk[n-1]
      for (let i = 1; i < chunks.length; i++) {
        const prevWords = chunks[i - 1].text.split(/\s+/);
        const currWords = chunks[i].text.split(/\s+/);
        const overlapWords = prevWords.slice(-5);
        const currStart = currWords.slice(0, 5);
        expect(overlapWords.some((w) => currStart.includes(w))).toBe(true);
      }
    });

    it('no chunk exceeds maxWords (except last chunk extension)', () => {
      const words = Array.from({ length: 100 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 3 });
      // Last chunk may exceed maxWords due to extension, but others should not
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].wordCount).toBeLessThanOrEqual(20);
      }
    });

    it('covers all words in original text', () => {
      const words = Array.from({ length: 50 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 1 });
      // First chunk starts at beginning
      expect(chunks[0].startOffset).toBe(0);
      // Last chunk ends at end of text
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.text).toContain('w49');
    });
  });

  describe('sentence boundary respect', () => {
    it('prefers to end chunk at period sentence boundary', () => {
      // Build text: 15 filler words, then "end." then 5 more words (21 total)
      const filler = Array.from({ length: 15 }, (_, i) => `filler${i}`);
      const tail = ['extra1', 'extra2', 'extra3', 'extra4', 'extra5'];
      const text = [...filler, 'end.', ...tail].join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 3, minWords: 1 });
      // First chunk should end at "end." since it is in the last 30% of the window
      expect(chunks[0].text.endsWith('end.')).toBe(true);
    });

    it('respects ! as sentence ending', () => {
      const words = Array.from({ length: 14 }, (_, i) => `w${i}`);
      const tail = ['more1', 'more2', 'more3', 'more4', 'more5', 'more6'];
      const text = [...words, 'done!', ...tail].join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 3, minWords: 1 });
      expect(chunks[0].text).toContain('done!');
    });

    it('respects ? as sentence ending', () => {
      const words = Array.from({ length: 14 }, (_, i) => `w${i}`);
      const tail = ['more1', 'more2', 'more3', 'more4', 'more5', 'more6'];
      const text = [...words, 'really?', ...tail].join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 3, minWords: 1 });
      expect(chunks[0].text).toContain('really?');
    });

    it('falls back to maxWords when no sentence boundary in last 30%', () => {
      // All words without punctuation - no sentence boundaries
      const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 1 });
      expect(chunks[0].wordCount).toBe(20);
    });
  });

  describe('minWords filter', () => {
    it('filters out single chunk below minWords', () => {
      const text = 'one two three';
      const chunks = chunkText(text, { maxWords: 200, minWords: 5 });
      expect(chunks).toEqual([]);
    });

    it('returns chunk when wordCount equals minWords', () => {
      const text = 'one two three four five';
      const chunks = chunkText(text, { maxWords: 200, minWords: 5 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].wordCount).toBe(5);
    });

    it('reassigns indices after filtering', () => {
      // If a chunk gets filtered, remaining chunks should have sequential indices
      const words = Array.from({ length: 100 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 3 });
      chunks.forEach((c, i) => {
        expect(c.index).toBe(i);
      });
    });
  });

  describe('offset calculation correctness', () => {
    it('text.slice(startOffset, endOffset) equals chunk.text', () => {
      const longText = Array.from({ length: 50 }, (_, i) =>
        `Sentence number ${i + 1} has some words in it.`
      ).join(' ');

      const chunks = chunkText(longText, { maxWords: 20, overlap: 5, minWords: 1 });
      for (const chunk of chunks) {
        const sliced = longText.slice(chunk.startOffset, chunk.endOffset);
        expect(sliced).toBe(chunk.text);
      }
    });

    it('tracks correct character offsets with leading whitespace', () => {
      const text = '  Hello  world  test  ';
      const chunks = chunkText(text, { maxWords: 200, minWords: 1 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].startOffset).toBe(2); // 'Hello' starts at index 2
      expect(chunks[0].endOffset).toBe(20);  // 'test' ends at index 20
      expect(chunks[0].text).toBe('Hello  world  test');
    });

    it('preserves original whitespace in chunk text', () => {
      const text = 'word1  word2\tword3\nword4';
      const chunks = chunkText(text, { maxWords: 200, minWords: 1 });
      expect(chunks[0].text).toBe(text);
    });

    it('has correct startOffset for second chunk', () => {
      const words = Array.from({ length: 40 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 1 });
      expect(chunks.length).toBeGreaterThan(1);
      // Second chunk starts at word index 15 (20 - 5 overlap)
      const expectedStart = text.indexOf('w15');
      expect(chunks[1].startOffset).toBe(expectedStart);
    });

    it('offset correctness holds for all chunks in a large text', () => {
      const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 30, overlap: 8, minWords: 5 });
      for (const chunk of chunks) {
        expect(text.slice(chunk.startOffset, chunk.endOffset)).toBe(chunk.text);
      }
    });
  });

  describe('unicode and special characters', () => {
    it('handles unicode text', () => {
      const text = 'こんにちは 世界 テスト データ 処理';
      const chunks = chunkText(text, { maxWords: 200, minWords: 1 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].wordCount).toBe(5);
      expect(chunks[0].text).toBe(text);
    });

    it('handles emoji in text', () => {
      const text = '🚀 launch 🎉 party 🌍 world 🔥 fire 💡 idea';
      const chunks = chunkText(text, { maxWords: 200, minWords: 1 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].wordCount).toBe(10);
    });

    it('handles accented characters', () => {
      const text = 'café résumé naïve über straße';
      const chunks = chunkText(text, { maxWords: 200, minWords: 1 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].wordCount).toBe(5);
      expect(chunks[0].text).toBe(text);
    });

    it('offsets are correct with multi-byte characters', () => {
      const text = 'Hello 世界 test 🚀 end';
      const chunks = chunkText(text, { maxWords: 200, minWords: 1 });
      expect(text.slice(chunks[0].startOffset, chunks[0].endOffset)).toBe(chunks[0].text);
    });
  });

  describe('custom options', () => {
    it('respects custom maxWords', () => {
      const words = Array.from({ length: 30 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 10, overlap: 2, minWords: 1 });
      expect(chunks.length).toBeGreaterThan(1);
      // Non-last chunks should be at most 10 words
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].wordCount).toBeLessThanOrEqual(10);
      }
    });

    it('respects custom overlap', () => {
      const words = Array.from({ length: 40 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      // With overlap=10 and maxWords=20, step = 20-10 = 10
      const chunks = chunkText(text, { maxWords: 20, overlap: 10, minWords: 1 });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // Verify overlap exists between consecutive chunks
      for (let i = 1; i < chunks.length; i++) {
        const prevWords = chunks[i - 1].text.split(/\s+/);
        const currWords = chunks[i].text.split(/\s+/);
        const overlapWords = prevWords.slice(-10);
        const currStart = currWords.slice(0, 10);
        expect(overlapWords.some((w) => currStart.includes(w))).toBe(true);
      }
    });

    it('respects custom minWords', () => {
      const text = 'one two three';
      expect(chunkText(text, { minWords: 4 })).toEqual([]);
      expect(chunkText(text, { minWords: 3 })).toHaveLength(1);
    });
  });

  describe('default options', () => {
    it('uses default options when none provided', () => {
      // 250 words triggers chunking with default maxWords=200
      const words = Array.from({ length: 250 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].wordCount).toBeLessThanOrEqual(200);
    });
  });

  describe('last chunk handling', () => {
    it('extends last chunk when remaining words < minWords', () => {
      // 25 words, maxWords=20, overlap=5: remaining after first chunk = 5
      // 5 < minWords(12), so first chunk extends to cover all 25 words
      const words = Array.from({ length: 25 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 12 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].wordCount).toBe(25);
    });

    it('creates separate last chunk when remaining words >= minWords', () => {
      const words = Array.from({ length: 50 }, (_, i) => `w${i}`);
      const text = words.join(' ');
      const chunks = chunkText(text, { maxWords: 20, overlap: 5, minWords: 3 });
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
