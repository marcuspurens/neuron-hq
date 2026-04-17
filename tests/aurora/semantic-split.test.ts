import { describe, it, expect } from 'vitest';
import { applyCharSplitPoints, groupBlocksIntoChapters, parseChapterTitles } from '../../src/aurora/semantic-split.js';
import type { TimelineBlock } from '../../src/aurora/speaker-timeline.js';

describe('applyCharSplitPoints', () => {
  const block: TimelineBlock = {
    speaker: 'SPEAKER_00',
    start_ms: 0,
    end_ms: 10000,
    text: 'Dogs are great pets. They are loyal. Cats are independent. They like to sleep.',
    words: [
      { start_ms: 0, end_ms: 500, word: 'Dogs ' },
      { start_ms: 500, end_ms: 1000, word: 'are ' },
      { start_ms: 1000, end_ms: 1500, word: 'great ' },
      { start_ms: 1500, end_ms: 2000, word: 'pets. ' },
      { start_ms: 2000, end_ms: 2500, word: 'They ' },
      { start_ms: 2500, end_ms: 3000, word: 'are ' },
      { start_ms: 3000, end_ms: 3500, word: 'loyal. ' },
      { start_ms: 3500, end_ms: 4500, word: 'Cats ' },
      { start_ms: 4500, end_ms: 5500, word: 'are ' },
      { start_ms: 5500, end_ms: 6500, word: 'independent. ' },
      { start_ms: 6500, end_ms: 7500, word: 'They ' },
      { start_ms: 7500, end_ms: 8500, word: 'like ' },
      { start_ms: 8500, end_ms: 9000, word: 'to ' },
      { start_ms: 9000, end_ms: 10000, word: 'sleep.' },
    ],
  };

  it('returns original block when no split points', () => {
    const result = applyCharSplitPoints(block, []);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(block.text);
  });

  it('splits at a single character index', () => {
    const splitAt = block.text.indexOf('Cats');
    const result = applyCharSplitPoints(block, [splitAt]);
    expect(result).toHaveLength(2);
    expect(result[0].text).toContain('loyal.');
    expect(result[1].text).toContain('Cats');
  });

  it('preserves speaker across splits', () => {
    const splitAt = block.text.indexOf('Cats');
    const result = applyCharSplitPoints(block, [splitAt]);
    for (const b of result) {
      expect(b.speaker).toBe('SPEAKER_00');
    }
  });

  it('distributes time proportionally', () => {
    const splitAt = block.text.indexOf('Cats');
    const result = applyCharSplitPoints(block, [splitAt]);
    expect(result[0].start_ms).toBe(0);
    expect(result[0].end_ms).toBeGreaterThan(0);
    expect(result[1].start_ms).toBe(result[0].end_ms);
    expect(result[1].end_ms).toBe(10000);
  });

  it('distributes words to correct sub-blocks', () => {
    const splitAt = block.text.indexOf('Cats');
    const result = applyCharSplitPoints(block, [splitAt]);
    expect(result[0].words).toBeDefined();
    expect(result[1].words).toBeDefined();
    const firstBlockWords = result[0].words!.map((w) => w.word.trim());
    const secondBlockWords = result[1].words!.map((w) => w.word.trim());
    expect(firstBlockWords).toContain('Dogs');
    expect(secondBlockWords).toContain('Cats');
  });

  it('handles multiple split points', () => {
    const split1 = block.text.indexOf('They are loyal.');
    const split2 = block.text.indexOf('Cats');
    const split3 = block.text.indexOf('They like');
    const result = applyCharSplitPoints(block, [split1, split2, split3]);
    expect(result).toHaveLength(4);
  });

  it('filters out invalid split points', () => {
    const result = applyCharSplitPoints(block, [-5, 0, block.text.length + 100]);
    expect(result).toHaveLength(1);
  });

  it('works without words', () => {
    const noWords: TimelineBlock = { ...block, words: undefined };
    const splitAt = block.text.indexOf('Cats');
    const result = applyCharSplitPoints(noWords, [splitAt]);
    expect(result).toHaveLength(2);
    expect(result[0].words).toBeUndefined();
    expect(result[1].words).toBeUndefined();
  });
});

describe('groupBlocksIntoChapters', () => {
  function mkBlock(text: string, startMs: number): TimelineBlock {
    return { speaker: 'S', start_ms: startMs, end_ms: startMs + 5000, text };
  }

  it('returns empty for single block', () => {
    expect(groupBlocksIntoChapters([mkBlock('short', 0)])).toHaveLength(1);
  });

  it('groups small blocks into 3-8 chapters', () => {
    const blocks = Array.from({ length: 20 }, (_, i) =>
      mkBlock('A'.repeat(500), i * 5000),
    );
    const groups = groupBlocksIntoChapters(blocks);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    expect(groups.length).toBeLessThanOrEqual(8);
    const totalBlocks = groups.reduce((sum, g) => sum + g.length, 0);
    expect(totalBlocks).toBe(20);
  });

  it('preserves block order within groups', () => {
    const blocks = Array.from({ length: 10 }, (_, i) =>
      mkBlock(`block-${i}`, i * 5000),
    );
    const groups = groupBlocksIntoChapters(blocks);
    const flat = groups.flat();
    for (let i = 0; i < flat.length; i++) {
      expect(flat[i].text).toBe(`block-${i}`);
    }
  });

  it('returns single group for very short total text', () => {
    const blocks = [mkBlock('hi', 0), mkBlock('bye', 5000)];
    const groups = groupBlocksIntoChapters(blocks);
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });
});

describe('parseChapterTitles', () => {
  it('parses JSON array of strings', () => {
    const result = parseChapterTitles('["Intro", "Main Topic", "Conclusion"]');
    expect(result).toEqual(['Intro', 'Main Topic', 'Conclusion']);
  });

  it('strips code fences', () => {
    const result = parseChapterTitles('```json\n["One", "Two"]\n```');
    expect(result).toEqual(['One', 'Two']);
  });

  it('extracts array from object wrapper', () => {
    const result = parseChapterTitles('{"titles": ["A", "B"]}');
    expect(result).toEqual(['A', 'B']);
  });

  it('returns empty for invalid JSON', () => {
    expect(parseChapterTitles('not json at all')).toEqual([]);
  });

  it('filters out non-string values', () => {
    const result = parseChapterTitles('[123, "Valid", null, "Also Valid"]');
    expect(result).toEqual(['Valid', 'Also Valid']);
  });

  it('truncates titles longer than 80 chars', () => {
    const long = 'A'.repeat(100);
    const result = parseChapterTitles(`["${long}"]`);
    expect(result[0].length).toBe(80);
  });
});


