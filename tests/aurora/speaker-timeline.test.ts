import { describe, it, expect } from 'vitest';
import {
  formatMs,
  buildSpeakerTimeline,
  splitAtSentenceBoundaries,
  splitAtWordBoundaries,
} from '../../src/aurora/speaker-timeline.js';
import type {
  WhisperSegment,
  WhisperWord,
  DiarizationSegment,
} from '../../src/aurora/speaker-timeline.js';

describe('formatMs', () => {
  it('converts 0 to 00:00:00', () => {
    expect(formatMs(0)).toBe('00:00:00');
  });

  it('converts 90061 to 00:01:30 (floors to seconds)', () => {
    expect(formatMs(90061)).toBe('00:01:30');
  });

  it('converts 3723000 to 01:02:03', () => {
    expect(formatMs(3723000)).toBe('01:02:03');
  });
});

describe('buildSpeakerTimeline', () => {
  it('returns empty array for empty input', () => {
    expect(buildSpeakerTimeline([], [])).toEqual([]);
  });

  it('assigns speaker based on maximum overlap', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 5000, text: 'Hello world' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 3000, speaker: 'SPEAKER_A' },
      { start_ms: 2000, end_ms: 5000, speaker: 'SPEAKER_B' },
    ];
    // SPEAKER_A overlaps 0-3000 = 3000ms
    // SPEAKER_B overlaps 2000-5000 = 3000ms
    // Both equal; first one found wins (SPEAKER_A)
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    // With equal overlap, the first matching speaker is kept
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toBe('Hello world');
  });

  it('assigns speaker with strictly more overlap', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 1000, end_ms: 6000, text: 'Testing overlap' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 2000, speaker: 'SPEAKER_A' },   // overlap: 1000ms
      { start_ms: 2000, end_ms: 7000, speaker: 'SPEAKER_B' }, // overlap: 4000ms
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('SPEAKER_B');
  });

  it('merges adjacent segments with the same speaker', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 3000, text: 'First part' },
      { start_ms: 3000, end_ms: 6000, text: 'second part' },
      { start_ms: 6000, end_ms: 9000, text: 'third part' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 9000, speaker: 'SPEAKER_A' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toBe('First part second part third part');
    expect(result[0].start_ms).toBe(0);
    expect(result[0].end_ms).toBe(9000);
  });

  it('does not merge segments with different speakers', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 3000, text: 'Hello' },
      { start_ms: 3000, end_ms: 6000, text: 'World' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 3000, speaker: 'SPEAKER_A' },
      { start_ms: 3000, end_ms: 6000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[1].speaker).toBe('SPEAKER_B');
  });

  it('splits text exceeding 7 lines into multiple blocks', () => {
    // Generate text with ~160 words (>150, i.e. >7 lines at ~20 words/line)
    const longText = Array.from({ length: 160 }, (_, i) => `word${i}`).join(' ');
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 60000, text: longText },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 60000, speaker: 'SPEAKER_A' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result.length).toBeGreaterThan(1);
    // All blocks should have the same speaker
    for (const block of result) {
      expect(block.speaker).toBe('SPEAKER_A');
    }
    // Combined text should contain all words
    const combined = result.map((b) => b.text).join(' ');
    expect(combined).toContain('word0');
    expect(combined).toContain('word159');
  });

  it('assigns UNKNOWN when no diarization segments overlap', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 10000, end_ms: 15000, text: 'No overlap here' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 5000, speaker: 'SPEAKER_A' },
      { start_ms: 20000, end_ms: 25000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('UNKNOWN');
    expect(result[0].text).toBe('No overlap here');
  });

  it('assigns UNKNOWN when diarization array is empty', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 5000, text: 'Alone' },
    ];
    const result = buildSpeakerTimeline(whisper, []);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('UNKNOWN');
  });

  it('handles gaps between diarization segments correctly', () => {
    // Whisper segments: one in covered area, one in gap, one in another covered area
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 3000, text: 'Before gap' },
      { start_ms: 5000, end_ms: 8000, text: 'In the gap' },
      { start_ms: 10000, end_ms: 13000, text: 'After gap' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 4000, speaker: 'SPEAKER_A' },
      // Gap: 4000-10000 — no diarization
      { start_ms: 10000, end_ms: 15000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(3);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toBe('Before gap');
    expect(result[1].speaker).toBe('UNKNOWN');
    expect(result[1].text).toBe('In the gap');
    expect(result[2].speaker).toBe('SPEAKER_B');
    expect(result[2].text).toBe('After gap');
  });

  it('returns blocks sorted by start_ms', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 6000, end_ms: 9000, text: 'Third' },
      { start_ms: 0, end_ms: 3000, text: 'First' },
      { start_ms: 3000, end_ms: 6000, text: 'Second' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 4000, speaker: 'SPEAKER_A' },
      { start_ms: 4000, end_ms: 10000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start_ms).toBeGreaterThanOrEqual(result[i - 1].start_ms);
    }
  });

  it('splits multi-sentence segments before speaker assignment', () => {
    // One whisper segment spans two speakers. The first sentence falls in SPEAKER_A's
    // time range and the second in SPEAKER_B's. Without sentence splitting, the whole
    // segment goes to whichever speaker has more overlap. With splitting, each sentence
    // gets its own speaker assignment.
    const whisper: WhisperSegment[] = [
      {
        start_ms: 0,
        end_ms: 10000,
        text: 'This is the first sentence. This is the second sentence.',
      },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 5000, speaker: 'SPEAKER_A' },
      { start_ms: 5000, end_ms: 10000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const speakerA = result.find((b) => b.speaker === 'SPEAKER_A');
    const speakerB = result.find((b) => b.speaker === 'SPEAKER_B');
    expect(speakerA).toBeDefined();
    expect(speakerB).toBeDefined();
    expect(speakerA!.text).toContain('first sentence');
    expect(speakerB!.text).toContain('second sentence');
  });

  it('preserves single-sentence segments unchanged through splitting', () => {
    const whisper: WhisperSegment[] = [
      { start_ms: 0, end_ms: 5000, text: 'Just one sentence' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 5000, speaker: 'SPEAKER_A' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Just one sentence');
    expect(result[0].speaker).toBe('SPEAKER_A');
  });
});

describe('splitAtWordBoundaries', () => {
  const mkWord = (start_ms: number, end_ms: number, word: string): WhisperWord => ({
    start_ms,
    end_ms,
    word,
  });

  it('falls back to sentence split when segment has no words', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 10000,
      text: 'First sentence. Second sentence.',
    };
    const dia: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 10000, speaker: 'SPEAKER_A' },
    ];
    const result = splitAtWordBoundaries(seg, dia);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('First sentence.');
  });

  it('returns segment unchanged when all words map to the same speaker', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 3000,
      text: ' Hello world today',
      words: [
        mkWord(0, 1000, ' Hello'),
        mkWord(1000, 2000, ' world'),
        mkWord(2000, 3000, ' today'),
      ],
    };
    const dia: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 5000, speaker: 'SPEAKER_A' },
    ];
    const result = splitAtWordBoundaries(seg, dia);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Hello world today');
  });

  it('splits at speaker change boundary between words', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 4000,
      text: ' I agree. No way.',
      words: [
        mkWord(0, 1000, ' I'),
        mkWord(1000, 2000, ' agree.'),
        mkWord(2000, 3000, ' No'),
        mkWord(3000, 4000, ' way.'),
      ],
    };
    const dia: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 2000, speaker: 'SPEAKER_A' },
      { start_ms: 2000, end_ms: 4000, speaker: 'SPEAKER_B' },
    ];
    const result = splitAtWordBoundaries(seg, dia);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('I agree.');
    expect(result[0].start_ms).toBe(0);
    expect(result[0].end_ms).toBe(2000);
    expect(result[1].text).toBe('No way.');
    expect(result[1].start_ms).toBe(2000);
    expect(result[1].end_ms).toBe(4000);
  });

  it('handles three speakers across one segment', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 6000,
      text: ' one two three four five six',
      words: [
        mkWord(0, 1000, ' one'),
        mkWord(1000, 2000, ' two'),
        mkWord(2000, 3000, ' three'),
        mkWord(3000, 4000, ' four'),
        mkWord(4000, 5000, ' five'),
        mkWord(5000, 6000, ' six'),
      ],
    };
    const dia: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 2000, speaker: 'A' },
      { start_ms: 2000, end_ms: 4000, speaker: 'B' },
      { start_ms: 4000, end_ms: 6000, speaker: 'C' },
    ];
    const result = splitAtWordBoundaries(seg, dia);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('one two');
    expect(result[1].text).toBe('three four');
    expect(result[2].text).toBe('five six');
  });

  it('preserves word-level timing on sub-segments', () => {
    const seg: WhisperSegment = {
      start_ms: 1000,
      end_ms: 5000,
      text: ' alpha beta gamma delta',
      words: [
        mkWord(1000, 2000, ' alpha'),
        mkWord(2000, 3000, ' beta'),
        mkWord(3000, 4000, ' gamma'),
        mkWord(4000, 5000, ' delta'),
      ],
    };
    const dia: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 3000, speaker: 'X' },
      { start_ms: 3000, end_ms: 6000, speaker: 'Y' },
    ];
    const result = splitAtWordBoundaries(seg, dia);
    expect(result).toHaveLength(2);
    expect(result[0].words).toHaveLength(2);
    expect(result[1].words).toHaveLength(2);
    expect(result[0].start_ms).toBe(1000);
    expect(result[0].end_ms).toBe(3000);
    expect(result[1].start_ms).toBe(3000);
    expect(result[1].end_ms).toBe(5000);
  });

  it('returns segment unchanged with empty diarization', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 2000,
      text: ' hello world',
      words: [
        mkWord(0, 1000, ' hello'),
        mkWord(1000, 2000, ' world'),
      ],
    };
    const result = splitAtWordBoundaries(seg, []);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe(' hello world');
  });

  it('falls back to sentence split when words array is empty', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 10000,
      text: 'Hello there. How are you?',
      words: [],
    };
    const dia: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 10000, speaker: 'A' },
    ];
    const result = splitAtWordBoundaries(seg, dia);
    expect(result).toHaveLength(2);
  });
});

describe('buildSpeakerTimeline with word timestamps', () => {
  const mkWord = (start_ms: number, end_ms: number, word: string): WhisperWord => ({
    start_ms,
    end_ms,
    word,
  });

  it('uses word-level splitting when segments have words', () => {
    const whisper: WhisperSegment[] = [
      {
        start_ms: 0,
        end_ms: 4000,
        text: ' Hello there. Goodbye now.',
        words: [
          mkWord(0, 1000, ' Hello'),
          mkWord(1000, 2000, ' there.'),
          mkWord(2000, 3000, ' Goodbye'),
          mkWord(3000, 4000, ' now.'),
        ],
      },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 2000, speaker: 'SPEAKER_A' },
      { start_ms: 2000, end_ms: 4000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(2);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toBe('Hello there.');
    expect(result[1].speaker).toBe('SPEAKER_B');
    expect(result[1].text).toBe('Goodbye now.');
  });

  it('falls back to sentence split when segments lack words', () => {
    const whisper: WhisperSegment[] = [
      {
        start_ms: 0,
        end_ms: 10000,
        text: 'This is the first sentence. This is the second sentence.',
      },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 5000, speaker: 'SPEAKER_A' },
      { start_ms: 5000, end_ms: 10000, speaker: 'SPEAKER_B' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.find((b) => b.speaker === 'SPEAKER_A')).toBeDefined();
    expect(result.find((b) => b.speaker === 'SPEAKER_B')).toBeDefined();
  });

  it('merges adjacent word-split sub-segments with same speaker', () => {
    const whisper: WhisperSegment[] = [
      {
        start_ms: 0,
        end_ms: 2000,
        text: ' first second',
        words: [
          mkWord(0, 1000, ' first'),
          mkWord(1000, 2000, ' second'),
        ],
      },
      {
        start_ms: 2000,
        end_ms: 4000,
        text: ' third fourth',
        words: [
          mkWord(2000, 3000, ' third'),
          mkWord(3000, 4000, ' fourth'),
        ],
      },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 4000, speaker: 'SPEAKER_A' },
    ];
    const result = buildSpeakerTimeline(whisper, diarization);
    expect(result).toHaveLength(1);
    expect(result[0].speaker).toBe('SPEAKER_A');
    expect(result[0].text).toContain('first');
    expect(result[0].text).toContain('fourth');
  });
});

describe('splitAtSentenceBoundaries', () => {
  it('returns single-element array for single sentence', () => {
    const seg: WhisperSegment = { start_ms: 0, end_ms: 5000, text: 'Hello world' };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(seg);
  });

  it('returns single-element array for empty text', () => {
    const seg: WhisperSegment = { start_ms: 0, end_ms: 5000, text: '' };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(1);
  });

  it('splits two sentences with proportional time', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 10000,
      text: 'Short. This is a much longer second sentence.',
    };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Short.');
    expect(result[1].text).toBe('This is a much longer second sentence.');
    expect(result[0].start_ms).toBe(0);
    expect(result[1].end_ms).toBe(10000);
    // Shorter sentence gets less time
    expect(result[0].end_ms).toBeLessThan(5000);
    // Times are contiguous
    expect(result[0].end_ms).toBe(result[1].start_ms);
  });

  it('splits three sentences', () => {
    const seg: WhisperSegment = {
      start_ms: 1000,
      end_ms: 7000,
      text: 'First. Second? Third!',
    };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('First.');
    expect(result[1].text).toBe('Second?');
    expect(result[2].text).toBe('Third!');
    expect(result[0].start_ms).toBe(1000);
    expect(result[2].end_ms).toBe(7000);
    // Contiguous
    expect(result[0].end_ms).toBe(result[1].start_ms);
    expect(result[1].end_ms).toBe(result[2].start_ms);
  });

  it('handles trailing text without punctuation', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 6000,
      text: 'Complete sentence. And then some more',
    };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('Complete sentence.');
    expect(result[1].text).toBe('And then some more');
    expect(result[1].end_ms).toBe(6000);
  });

  it('handles question marks and exclamation points', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 9000,
      text: 'Is this working? Yes it is! Great.',
    };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('Is this working?');
    expect(result[1].text).toBe('Yes it is!');
    expect(result[2].text).toBe('Great.');
  });

  it('does not split on periods without following space', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 5000,
      text: 'Version 3.1 is here',
    };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Version 3.1 is here');
  });

  it('handles closing quotes after punctuation', () => {
    const seg: WhisperSegment = {
      start_ms: 0,
      end_ms: 8000,
      text: 'He said "hello." Then she replied.',
    };
    const result = splitAtSentenceBoundaries(seg);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('He said "hello."');
    expect(result[1].text).toBe('Then she replied.');
  });
});

describe('chapter breaks in buildSpeakerTimeline', () => {
  it('produces 3 blocks that stay separate after step 3 split', () => {
    const segments: WhisperSegment[] = [
      { start_ms: 0, end_ms: 5000, text: 'Hello from introduction.' },
      { start_ms: 60000, end_ms: 120000, text: 'A2A is a protocol for agent communication.' },
      { start_ms: 180000, end_ms: 240000, text: 'MCP stands for Model Context Protocol.' },
    ];
    const diarization: DiarizationSegment[] = [
      { start_ms: 0, end_ms: 5000, speaker: 'SPEAKER_00' },
      { start_ms: 60000, end_ms: 120000, speaker: 'SPEAKER_00' },
      { start_ms: 180000, end_ms: 240000, speaker: 'SPEAKER_00' },
    ];
    const chapterBreaksMs = new Set([0, 60000, 180000]);
    const blocks = buildSpeakerTimeline(segments, diarization, { chapterBreaksMs });
    expect(blocks.length).toBe(3);
    expect(blocks[0].text).toContain('introduction');
    expect(blocks[1].text).toContain('A2A');
    expect(blocks[2].text).toContain('MCP');
  });
});

describe('word-level timecodes propagation', () => {
  const words: WhisperWord[] = [
    { start_ms: 0, end_ms: 500, word: 'Hello ' },
    { start_ms: 500, end_ms: 1000, word: 'world ' },
    { start_ms: 1000, end_ms: 1500, word: 'from ' },
    { start_ms: 1500, end_ms: 2000, word: 'speaker' },
  ];

  const segments: WhisperSegment[] = [
    { start_ms: 0, end_ms: 2000, text: 'Hello world from speaker', words },
  ];

  const diarization: DiarizationSegment[] = [
    { start_ms: 0, end_ms: 2000, speaker: 'SPEAKER_00' },
  ];

  it('preserves words on timeline blocks', () => {
    const blocks = buildSpeakerTimeline(segments, diarization);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].words).toBeDefined();
    expect(blocks[0].words).toHaveLength(4);
    expect(blocks[0].words![0].start_ms).toBe(0);
    expect(blocks[0].words![0].word).toBe('Hello ');
  });

  it('merges words when adjacent same-speaker blocks are merged', () => {
    const seg1: WhisperSegment = {
      start_ms: 0, end_ms: 1000, text: 'Hello world',
      words: [
        { start_ms: 0, end_ms: 500, word: 'Hello ' },
        { start_ms: 500, end_ms: 1000, word: 'world ' },
      ],
    };
    const seg2: WhisperSegment = {
      start_ms: 1000, end_ms: 2000, text: 'from speaker',
      words: [
        { start_ms: 1000, end_ms: 1500, word: 'from ' },
        { start_ms: 1500, end_ms: 2000, word: 'speaker' },
      ],
    };
    const blocks = buildSpeakerTimeline([seg1, seg2], diarization);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].words).toHaveLength(4);
    expect(blocks[0].words![2].word).toBe('from ');
  });

  it('splits words across chunks when block exceeds max lines', () => {
    const longWords: WhisperWord[] = [];
    const wordTexts: string[] = [];
    for (let i = 0; i < 200; i++) {
      longWords.push({ start_ms: i * 100, end_ms: (i + 1) * 100, word: `w${i} ` });
      wordTexts.push(`w${i}`);
    }
    const longSeg: WhisperSegment[] = [{
      start_ms: 0, end_ms: 20000, text: wordTexts.join(' '),
      words: longWords,
    }];
    const blocks = buildSpeakerTimeline(longSeg, [
      { start_ms: 0, end_ms: 20000, speaker: 'SP' },
    ]);
    expect(blocks.length).toBeGreaterThan(1);
    const allWords = blocks.flatMap((b) => b.words ?? []);
    expect(allWords.length).toBeGreaterThan(0);
    expect(allWords.length).toBeLessThanOrEqual(200);
  });
});
