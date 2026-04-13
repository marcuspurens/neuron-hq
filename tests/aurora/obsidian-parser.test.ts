import { describe, it, expect, vi } from 'vitest';

// Mock gray-matter before importing obsidian-parser (which depends on it).
// vi.mock is hoisted by vitest, but we declare it at the top for clarity.
vi.mock('gray-matter', () => ({
  default: (str: string) => {
    if (typeof str !== 'string' || !str.startsWith('---')) {
      return { data: {}, content: str || '' };
    }
    const match = str.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: str };
    const yamlBlock = match[1];
    const content = match[2] || '';
    // Parse simple YAML (supports up to 3 levels of nesting)
    const data: Record<string, unknown> = {};
    let currentKey = '';
    let currentObj: Record<string, unknown> | null = null;
    let subKey = '';
    let subObj: Record<string, unknown> | null = null;

    const parseValue = (val: string): unknown => {
      const trimmed = val.replace(/^["']|["']$/g, '');
      if (trimmed === '') return '';
      if (!isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
      return trimmed;
    };

    for (const line of yamlBlock.split('\n')) {
      // Top level key: value  (no leading spaces)
      const topMatch = line.match(/^(\w[\w_-]*):\s*(.*)$/);
      // Second level (2-space indent) — key with no value (sub-object)
      const midMatch = line.match(/^  (\w[\w_-]*):\s*$/);
      // Second level (2-space indent) — key: value
      const midValMatch = line.match(/^  (\w[\w_-]*):\s+(.+)$/);
      // Third level (4-space indent) — key: value
      const deepMatch = line.match(/^    (\w[\w_-]*):\s+(.+)$/);

      if (topMatch) {
        currentObj = null;
        subObj = null;
        const [, key, val] = topMatch;
        if (val) {
          data[key] = parseValue(val);
        } else {
          data[key] = {};
          currentKey = key;
          currentObj = data[key] as Record<string, unknown>;
        }
      } else if (midMatch && currentObj) {
        const [, key] = midMatch;
        currentObj[key] = {};
        subKey = key;
        subObj = currentObj[key] as Record<string, unknown>;
      } else if (midValMatch && currentObj) {
        const [, key, val] = midValMatch;
        currentObj[key] = parseValue(val);
        subObj = null;
      } else if (deepMatch && subObj) {
        const [, key, val] = deepMatch;
        subObj[key] = parseValue(val);
      }
    }
    return { data, content };
  },
}));

import {
  parseTimecodeToMs,
  extractSpeakers,
  extractSpeakersFromTable,
  extractHighlights,
  extractComments,
  matchSegmentTime,
  parseObsidianFile,
  parseSentiment,
  extractBriefingAnswers,
  extractTitle,
  extractContentSection,
  extractTimelineBlocks,
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
      {
        label: 'SPEAKER_00',
        name: 'Marcus',
        title: '',
        organization: '',
        confidence: 0.85,
        role: 'host',
      },
      { label: 'SPEAKER_01', name: '', title: '', organization: '', confidence: 0.72, role: '' },
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
      { label: 'SPEAKER_00', name: '', title: '', organization: '', confidence: 0, role: '' },
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

describe('extractSpeakersFromTable', () => {
  it('extracts speakers from 6-column table', () => {
    const body = [
      '## Talare',
      '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
      '|-------|------|-------|--------------|------|----------------|',
      '| SPEAKER_00 |  |  |  |  | 0.7 |',
      '| SPEAKER_01 | Anna Svensson | Journalist | SVT | Intervjuare | 0.9 |',
      '',
      '## Tidslinje',
    ].join('\n');
    const result = extractSpeakersFromTable(body);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      label: 'SPEAKER_00',
      name: '',
      title: '',
      organization: '',
      confidence: 0.7,
      role: '',
    });
    expect(result[1]).toEqual({
      label: 'SPEAKER_01',
      name: 'Anna Svensson',
      title: 'Journalist',
      organization: 'SVT',
      role: 'Intervjuare',
      confidence: 0.9,
    });
  });

  it('returns empty array when no Talare section', () => {
    expect(extractSpeakersFromTable('## Tidslinje\nsome content')).toEqual([]);
  });

  it('returns empty array when table has only headers', () => {
    const body = [
      '## Talare',
      '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
      '|-------|------|-------|--------------|------|----------------|',
      '',
      '## Tidslinje',
    ].join('\n');
    expect(extractSpeakersFromTable(body)).toEqual([]);
  });

  it('handles mixed identified and unidentified speakers', () => {
    const body = [
      '## Talare',
      '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
      '|-------|------|-------|--------------|------|----------------|',
      '| Marcus | Marcus Persson | VD | Neuron | Värd | 0.95 |',
      '| SPEAKER_01 |  |  |  |  | 0.5 |',
    ].join('\n');
    const result = extractSpeakersFromTable(body);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Marcus');
    expect(result[0].name).toBe('Marcus Persson');
    expect(result[0].organization).toBe('Neuron');
    expect(result[1].name).toBe('');
    expect(result[1].confidence).toBe(0.5);
  });

  it('trims whitespace from all fields', () => {
    const body = [
      '## Talare',
      '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
      '|-------|------|-------|--------------|------|----------------|',
      '|  SPEAKER_00  |  Anna  |  Dr  |  KI  |  Gäst  |  0.8  |',
    ].join('\n');
    const result = extractSpeakersFromTable(body);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      label: 'SPEAKER_00',
      name: 'Anna',
      title: 'Dr',
      organization: 'KI',
      role: 'Gäst',
      confidence: 0.8,
    });
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
    expect(result).toEqual([{ timecode_ms: 60000, text: 'This is important' }]);
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
      title: '',
      organization: '',
      confidence: 0.85,
      role: 'host',
    });
    expect(result!.speakers[1]).toEqual({
      label: 'SPEAKER_01',
      name: '',
      title: '',
      organization: '',
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
    const content = ['---', 'type: transcript', '---', 'Some content'].join('\n');
    expect(parseObsidianFile(content)).toBeNull();
  });

  it('returns null for corrupt/invalid content', () => {
    // gray-matter may not throw on this but id will be missing → null
    expect(parseObsidianFile('')).toBeNull();
    expect(parseObsidianFile('\x00\x01\x02')).toBeNull();
  });

  it('handles file with id but no speakers or highlights', () => {
    const content = ['---', 'id: minimal-file', '---', 'Just some text, no headers.'].join('\n');
    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('minimal-file');
    expect(result!.speakers).toEqual([]);
    expect(result!.highlights).toEqual([]);
    expect(result!.comments).toEqual([]);
  });

  it('converts numeric id to string', () => {
    const content = ['---', 'id: 12345', '---', 'Content'].join('\n');
    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('12345');
  });

  it('returns null for content without frontmatter', () => {
    const content = 'no frontmatter at all';
    expect(parseObsidianFile(content)).toBeNull();
  });

  it('prefers table speakers over YAML frontmatter speakers', () => {
    const content = [
      '---',
      'id: vid-with-both',
      'speakers:',
      '  SPEAKER_00:',
      '    name: "Old Name"',
      '    confidence: 0.5',
      '    role: "old"',
      '---',
      '',
      '## Talare',
      '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
      '|-------|------|-------|--------------|------|----------------|',
      '| SPEAKER_00 | New Name | Dr | KI | Värd | 0.95 |',
      '',
      '## Tidslinje',
    ].join('\n');

    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.speakers).toHaveLength(1);
    expect(result!.speakers[0]).toEqual({
      label: 'SPEAKER_00',
      name: 'New Name',
      title: 'Dr',
      organization: 'KI',
      role: 'Värd',
      confidence: 0.95,
    });
  });

  it('falls back to YAML speakers when table has no data rows', () => {
    const content = [
      '---',
      'id: vid-yaml-only',
      'speakers:',
      '  SPEAKER_00:',
      '    name: "Marcus"',
      '    confidence: 0.85',
      '    role: "host"',
      '---',
      '',
      '## Talare',
      '| Label | Namn | Titel | Organisation | Roll | Konfidenspoäng |',
      '|-------|------|-------|--------------|------|----------------|',
      '',
      '## Tidslinje',
    ].join('\n');

    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.speakers).toHaveLength(1);
    expect(result!.speakers[0].name).toBe('Marcus');
    expect(result!.speakers[0].confidence).toBe(0.85);
  });
});

// --- New tests for briefing feedback parsing ---

describe('parseSentiment', () => {
  it('returns positive for thumbs-up emoji', () => {
    expect(parseSentiment('\u{1F44D} Bra ide!')).toBe('positive');
    expect(parseSentiment('Det var \u{1F44D}')).toBe('positive');
  });

  it('returns positive when text starts with ja or yes (case-insensitive)', () => {
    expect(parseSentiment('Ja, det st\u00e4mmer')).toBe('positive');
    expect(parseSentiment('ja det st\u00e4mmer')).toBe('positive');
    expect(parseSentiment('Yes, absolutely')).toBe('positive');
    expect(parseSentiment('YES please')).toBe('positive');
  });

  it('returns negative for thumbs-down emoji or text starting with nej/no', () => {
    expect(parseSentiment('\u{1F44E} D\u00e5lig ide')).toBe('negative');
    expect(parseSentiment('Nej, inte relevant')).toBe('negative');
    expect(parseSentiment('nej tack')).toBe('negative');
    expect(parseSentiment('No, skip this')).toBe('negative');
    expect(parseSentiment('NO way')).toBe('negative');
  });

  it('returns neutral for plain text without sentiment signals', () => {
    expect(parseSentiment('Kanske, vi f\u00e5r se')).toBe('neutral');
    expect(parseSentiment('Intressant perspektiv')).toBe('neutral');
    expect(parseSentiment('Beh\u00f6ver mer info')).toBe('neutral');
  });
});

describe('extractBriefingAnswers', () => {
  it('parses question with svar, node_id, and category correctly', () => {
    const body = [
      '### Fr\u00e5ga 1: Vill du utforska gap-noden "AI-etik"?',
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
      '### Fr\u00e5ga 1: F\u00f6rsta fr\u00e5gan',
      '<!-- question_node_id: node-1 -->',
      '<!-- question_category: stale -->',
      '<!-- svar: -->',
      '',
      '### Fr\u00e5ga 2: Andra fr\u00e5gan',
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

describe('extractTitle', () => {
  it('returns title from first H1 heading', () => {
    expect(extractTitle('# Min Rubrik\n\nText')).toBe('Min Rubrik');
  });
  it('returns null when no H1 heading', () => {
    expect(extractTitle('Ingen rubrik')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(extractTitle('')).toBeNull();
  });
  it('ignores H2 headings', () => {
    expect(extractTitle('## Not H1\n\n# Rätt')).toBe('Rätt');
  });
});

describe('extractContentSection', () => {
  it('extracts content under ## Innehåll heading', () => {
    expect(extractContentSection('## Innehåll\n\nHello world\n\n## Kopplingar')).toBe(
      'Hello world'
    );
  });
  it('returns null when no ## Innehåll section', () => {
    expect(extractContentSection('Inget innehåll')).toBeNull();
  });
  it('returns null for empty ## Innehåll section (AC2)', () => {
    expect(extractContentSection('## Innehåll\n\n## Kopplingar')).toBeNull();
  });
  it('extracts content until end of file when no next section', () => {
    expect(extractContentSection('## Innehåll\n\nJust text here')).toBe('Just text here');
  });
  it('returns null for whitespace-only content', () => {
    expect(extractContentSection('## Innehåll\n\n   \n\n## Annat')).toBeNull();
  });
});

describe('parseObsidianFile new fields', () => {
  it('returns title, confidence, textContent, exportedAt correctly when all present', () => {
    const content = [
      '---',
      'id: new-fields-test',
      'confidence: 0.8',
      'exported_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# My Title',
      '',
      '## Innehåll',
      '',
      'Test content',
      '',
      '## Kopplingar',
      '',
      'Other stuff',
    ].join('\n');

    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('My Title');
    expect(result!.confidence).toBe(0.8);
    expect(result!.textContent).toBe('Test content');
    expect(result!.exportedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns null fields when confidence, exported_at, title, and ## Innehåll not present', () => {
    const content = [
      '---',
      'id: minimal-new-fields',
      '---',
      '',
      'Just plain text, no headings.',
    ].join('\n');

    const result = parseObsidianFile(content);
    expect(result).not.toBeNull();
    expect(result!.title).toBeNull();
    expect(result!.confidence).toBeNull();
    expect(result!.textContent).toBeNull();
    expect(result!.exportedAt).toBeNull();
    expect(result!.tags).toBeNull();
    expect(result!.timelineBlocks).toBeNull();
  });
});

describe('extractTimelineBlocks', () => {
  it('extracts speaker and text from timeline headers', () => {
    const body = [
      '### 00:00:00 \u2014 SPEAKER_00',
      'Hello from speaker zero',
      '',
      '### 00:01:00 \u2014 SPEAKER_01',
      'Now speaker one talks',
    ].join('\n');

    const blocks = extractTimelineBlocks(body);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      timecode_ms: 0,
      speaker: 'SPEAKER_00',
      text: 'Hello from speaker zero',
    });
    expect(blocks[1]).toEqual({
      timecode_ms: 60000,
      speaker: 'SPEAKER_01',
      text: 'Now speaker one talks',
    });
  });

  it('strips hash-tags from speaker name', () => {
    const body = '### 00:01:00 \u2014 Marcus #highlight #key-insight\nSome text';
    const blocks = extractTimelineBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].speaker).toBe('Marcus');
  });

  it('skips HTML comment lines from block text', () => {
    const body = [
      '### 00:00:00 \u2014 SPEAKER_00',
      'Text before comment',
      '<!-- kommentar: some note -->',
      'Text after comment',
    ].join('\n');

    const blocks = extractTimelineBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).not.toContain('kommentar');
    expect(blocks[0].text).toContain('Text before comment');
    expect(blocks[0].text).toContain('Text after comment');
  });

  it('returns empty array for body without timeline headers', () => {
    expect(extractTimelineBlocks('Just plain text')).toEqual([]);
  });
});
