import { describe, it, expect, vi } from 'vitest';
import {
  parseTimecodeToMs,
  extractSpeakers,
  extractHighlights,
  extractComments,
  matchSegmentTime,
  parseObsidianFile,
  parseSentiment,
  extractBriefingAnswers,
} from '../../src/aurora/obsidian-parser.js';

// Mock the logger to suppress output during tests
vi.mock('../../src/core/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('parseTimecodeToMs', () => {
  it('converts 00:00:00 to 0', () => {
    expect(parseTimecodeToMs('00:00:00')).toBe(0);
  });

  it('converts 00:01:45 to 105000', () => {
    expect(parseTimecodeToMs('00:01:45')).toBe(105000);
  });

  it('converts 01:00:00 to 3600000', () => {
    expect(parseTimecodeToMs('01:00:00')).toBe(3600000);
  });

  it('converts 01:30:00 to 5400000', () => {
    expect(parseTimecodeToMs('01:30:00')).toBe(5400000);
  });

  it('converts 02:15:30 to 8130000', () => {
    expect(parseTimecodeToMs('02:15:30')).toBe(8130000);
  });

  it('returns 0 for invalid format', () => {
    expect(parseTimecodeToMs('invalid')).toBe(0);
    expect(parseTimecodeToMs('12:34')).toBe(0);
  });
});

describe('extractSpeakers', () => {
  it('extracts speakers from valid frontmatter with 2 speakers', () => {
    const frontmatter = {
      speakers: {
        SPEAKER_00: { name: 'Marcus', confidence: 0.85, role: 'host' },
        SPEAKER_01: { name: '', confidence: 0.72, role: '' },
      },
    };
    const result = extractSpeakers(frontmatter);
    expect(result).toEqual([
      { label: 'SPEAKER_00', name: 'Marcus', confidence: 0.85, role: 'host' },
      { label: 'SPEAKER_01', name: '', confidence: 0.72, role: '' },
    ]);
  });

  it('returns empty array for empty speakers object {}', () => {
    const frontmatter = { speakers: {} };
    expect(extractSpeakers(frontmatter)).toEqual([]);
  });

  it('returns empty array when no speakers key', () => {
    expect(extractSpeakers({})).toEqual([]);
  });

  it('returns empty array when speakers value is null', () => {
    expect(extractSpeakers({ speakers: null })).toEqual([]);
  });

  it('handles missing fields with defaults', () => {
    const frontmatter = {
      speakers: {
        SPEAKER_00: {},
      },
    };
    const result = extractSpeakers(frontmatter);
    expect(result).toEqual([
      { label: 'SPEAKER_00', name: '', confidence: 0, role: '' },
    ]);
  });

  it('skips non-object speaker entries', () => {
    const frontmatter = {
      speakers: {
        SPEAKER_00: 'invalid',
        SPEAKER_01: { name: 'Valid', confidence: 0.9, role: 'guest' },
      },
    };
    const result = extractSpeakers(frontmatter);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('SPEAKER_01');
  });
});

describe('extractHighlights', () => {
  it('extracts single known tag from timecode header', () => {
    const body = '### 00:01:45 \u2014 Dario Amodei #highlight';
    const result = extractHighlights(body);
    expect(result).toEqual([{ timecode_ms: 105000, tag: 'highlight' }]);
  });

  it('extracts multiple known tags from one header', () => {
    const body = '### 00:01:45 \u2014 Speaker #highlight #key-insight';
    const result = extractHighlights(body);
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { timecode_ms: 105000, tag: 'highlight' },
      { timecode_ms: 105000, tag: 'key-insight' },
    ]);
  });

  it('ignores unknown tags', () => {
    const body = '### 00:01:45 \u2014 Speaker #random';
    const result = extractHighlights(body);
    expect(result).toEqual([]);
  });

  it('returns empty array for header without any tag', () => {
    const body = '### 00:01:45 \u2014 Speaker';
    const result = extractHighlights(body);
    expect(result).toEqual([]);
  });

  it('extracts known tags from multiple headers', () => {
    const body = [
      '### 00:01:00 \u2014 Marcus #highlight #quote',
      'Some text here',
      '### 00:05:30 \u2014 SPEAKER_01 #key-insight',
    ].join('\n');

    const result = extractHighlights(body);
    expect(result).toEqual([
      { timecode_ms: 60000, tag: 'highlight' },
      { timecode_ms: 60000, tag: 'quote' },
      { timecode_ms: 330000, tag: 'key-insight' },
    ]);
  });

  it('filters unknown tags but keeps known ones in same header', () => {
    const body = '### 00:02:00 \u2014 Speaker #random #highlight #unknown';
    const result = extractHighlights(body);
    expect(result).toEqual([{ timecode_ms: 120000, tag: 'highlight' }]);
  });

  it('returns empty array for body without headers', () => {
    expect(extractHighlights('Just some text')).toEqual([]);
  });

  it('handles follow-up tag', () => {
    const body = '### 00:00:30 \u2014 Guest #follow-up';
    const result = extractHighlights(body);
    expect(result).toEqual([{ timecode_ms: 30000, tag: 'follow-up' }]);
  });

  it('ignores headers with regular dashes (not em dash)', () => {
    const body = '### 00:01:00 - Speaker #highlight';
    expect(extractHighlights(body)).toEqual([]);
  });
});

describe('extractComments', () => {
  it('extracts comment with preceding header and correct timecode', () => {
    const body = [
      '### 00:01:00 \u2014 Marcus',
      'Some text',
      '<!-- kommentar: This is important -->',
    ].join('\n');

    const result = extractComments(body);
    expect(result).toEqual([
      { timecode_ms: 60000, text: 'This is important' },
    ]);
  });

  it('skips comments before any timecode header (orphan comment)', () => {
    const body = [
      '<!-- kommentar: orphan comment -->',
      '### 00:01:00 \u2014 Marcus',
      '<!-- kommentar: valid comment -->',
    ].join('\n');

    const result = extractComments(body);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('valid comment');
  });

  it('assigns same timecode to multiple comments under same header', () => {
    const body = [
      '### 00:03:00 \u2014 Marcus',
      'First paragraph',
      '<!-- kommentar: First comment -->',
      'Second paragraph',
      '<!-- kommentar: Second comment -->',
    ].join('\n');

    const result = extractComments(body);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ timecode_ms: 180000, text: 'First comment' });
    expect(result[1]).toEqual({ timecode_ms: 180000, text: 'Second comment' });
  });

  it('associates comments with correct headers across sections', () => {
    const body = [
      '### 00:01:00 \u2014 Marcus',
      'Some text',
      '<!-- kommentar: This is important -->',
      '### 00:05:00 \u2014 SPEAKER_01',
      '<!-- kommentar: Follow up on this -->',
    ].join('\n');

    const result = extractComments(body);
    expect(result).toEqual([
      { timecode_ms: 60000, text: 'This is important' },
      { timecode_ms: 300000, text: 'Follow up on this' },
    ]);
  });

  it('returns empty array when no comments', () => {
    const body = '### 00:01:00 \u2014 Marcus\nSome text';
    expect(extractComments(body)).toEqual([]);
  });
});

describe('matchSegmentTime', () => {
  const segments = [
    { start_ms: 0 },
    { start_ms: 60000 },
    { start_ms: 120000 },
    { start_ms: 300000 },
  ];

  it('returns exact match', () => {
    expect(matchSegmentTime(60000, segments)).toBe(60000);
  });

  it('returns closest within 5000ms tolerance', () => {
    expect(matchSegmentTime(62000, segments)).toBe(60000);
    expect(matchSegmentTime(57000, segments)).toBe(60000);
  });

  it('returns null when timecode is more than 5s from any segment', () => {
    expect(matchSegmentTime(200000, segments)).toBeNull();
  });

  it('returns null for empty segments array', () => {
    expect(matchSegmentTime(60000, [])).toBeNull();
  });

  it('returns match at exactly 5000ms boundary', () => {
    expect(matchSegmentTime(65000, segments)).toBe(60000);
  });

  it('returns null when closest segment is beyond 5000ms', () => {
    expect(matchSegmentTime(90000, segments)).toBeNull();
  });

  it('returns null at 5001ms delta', () => {
    expect(matchSegmentTime(65001, segments)).toBeNull();
  });
});

describe('parseObsidianFile', () => {
  it('parses full file with id, speakers, tags, and comments', () => {
    const content = [
      '---',
      'id: video-abc-123',
      'type: transcript',
      'platform: youtube',
      'duration: "01:23:45"',
      'speakers:',
      '  SPEAKER_00:',
      '    name: "Marcus"',
      '    confidence: 0.85',
      '    role: "host"',
      '  SPEAKER_01:',
      '    name: ""',
      '    confidence: 0.72',
      '    role: ""',
      '---',
      '',
      '# Test Video Title',
      '',
      '## Talare',
      '| ID | Namn | Konfidenspo\u00e4ng | Roll |',
      '|----|------|-----------|------|',
      '',
      '## Tidslinje',
      '',
      '### 00:01:45 \u2014 Marcus #highlight',
      'I would think about tasks that are human-centered...',
      '<!-- kommentar: Darios huvudtes om framtiden -->',
      '',
      '### 00:05:30 \u2014 SPEAKER_01 #key-insight #quote',
      'Another important point here.',
    ].join('\n');

    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('video-abc-123');
    expect(result!.speakers).toHaveLength(2);
    expect(result!.speakers[0]).toEqual({
      label: 'SPEAKER_00',
      name: 'Marcus',
      confidence: 0.85,
      role: 'host',
    });
    expect(result!.speakers[1]).toEqual({
      label: 'SPEAKER_01',
      name: '',
      confidence: 0.72,
      role: '',
    });
    expect(result!.highlights).toEqual([
      { segment_start_ms: 105000, tag: 'highlight' },
      { segment_start_ms: 330000, tag: 'key-insight' },
      { segment_start_ms: 330000, tag: 'quote' },
    ]);
    expect(result!.comments).toEqual([
      { segment_start_ms: 105000, text: 'Darios huvudtes om framtiden' },
    ]);
  });

  it('returns null when no id in frontmatter', () => {
    const content = [
      '---',
      'type: transcript',
      '---',
      'Some content',
    ].join('\n');
    expect(parseObsidianFile(content)).toBeNull();
  });

  it('returns null for corrupt/invalid content', () => {
    // gray-matter may not throw on this but id will be missing → null
    expect(parseObsidianFile('')).toBeNull();
    expect(parseObsidianFile('\x00\x01\x02')).toBeNull();
  });

  it('handles file with id but no speakers or highlights', () => {
    const content = [
      '---',
      'id: minimal-file',
      '---',
      'Just some text, no headers.',
    ].join('\n');
    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('minimal-file');
    expect(result!.speakers).toEqual([]);
    expect(result!.highlights).toEqual([]);
    expect(result!.comments).toEqual([]);
  });

  it('converts numeric id to string', () => {
    const content = [
      '---',
      'id: 12345',
      '---',
      'Content',
    ].join('\n');
    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('12345');
  });

  it('returns null for content without frontmatter', () => {
    const content = 'no frontmatter at all';
    expect(parseObsidianFile(content)).toBeNull();
  });
});

// --- New tests for briefing feedback parsing ---

describe('parseSentiment', () => {
  it('returns positive for thumbs-up emoji', () => {
    expect(parseSentiment('👍 Bra ide!')).toBe('positive');
    expect(parseSentiment('Det var 👍')).toBe('positive');
  });

  it('returns positive when text starts with ja or yes (case-insensitive)', () => {
    expect(parseSentiment('Ja, det stämmer')).toBe('positive');
    expect(parseSentiment('ja det stämmer')).toBe('positive');
    expect(parseSentiment('Yes, absolutely')).toBe('positive');
    expect(parseSentiment('YES please')).toBe('positive');
  });

  it('returns negative for thumbs-down emoji or text starting with nej/no', () => {
    expect(parseSentiment('👎 Dålig ide')).toBe('negative');
    expect(parseSentiment('Nej, inte relevant')).toBe('negative');
    expect(parseSentiment('nej tack')).toBe('negative');
    expect(parseSentiment('No, skip this')).toBe('negative');
    expect(parseSentiment('NO way')).toBe('negative');
  });

  it('returns neutral for plain text without sentiment signals', () => {
    expect(parseSentiment('Kanske, vi får se')).toBe('neutral');
    expect(parseSentiment('Intressant perspektiv')).toBe('neutral');
    expect(parseSentiment('Behöver mer info')).toBe('neutral');
  });
});

describe('extractBriefingAnswers', () => {
  it('parses question with svar, node_id, and category correctly', () => {
    const body = [
      '### Fråga 1: Vill du utforska gap-noden "AI-etik"?',
      '<!-- question_node_id: node-abc-123 -->',
      '<!-- question_category: gap -->',
      '<!-- svar: Ja, det vore intressant -->',
    ].join('\n');

    const result = extractBriefingAnswers(body);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      questionIndex: 1,
      questionText: 'Vill du utforska gap-noden "AI-etik"?',
      answer: 'Ja, det vore intressant',
      questionNodeId: 'node-abc-123',
      questionCategory: 'gap',
      sentiment: 'positive',
    });
  });

  it('skips empty svar comments', () => {
    const body = [
      '### Fråga 1: Första frågan',
      '<!-- question_node_id: node-1 -->',
      '<!-- question_category: stale -->',
      '<!-- svar: -->',
      '',
      '### Fråga 2: Andra frågan',
      '<!-- question_node_id: node-2 -->',
      '<!-- question_category: idea -->',
      '<!-- svar: Nej, inte relevant -->',
    ].join('\n');

    const result = extractBriefingAnswers(body);
    expect(result).toHaveLength(1);
    expect(result[0].questionIndex).toBe(2);
    expect(result[0].answer).toBe('Nej, inte relevant');
    expect(result[0].sentiment).toBe('negative');
    expect(result[0].questionCategory).toBe('idea');
  });
});
