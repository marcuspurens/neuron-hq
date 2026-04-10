import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFacit, evalFromPipelineJson, formatEvalSummary, normalizedValueMatch, fuzzyContains } from '../../src/aurora/pdf-eval.js';
import type { Facit, EvalResult } from '../../src/aurora/types.js';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'pdf-eval');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

function loadJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8')) as Record<string, unknown>;
}

describe('parseFacit', () => {
  it('parses p10 facit YAML correctly', () => {
    const content = loadFixture('ungdomsbarometern-p10.yaml');
    const facit = parseFacit(content);

    expect(facit.source).toBe('© Ungdomsbarometern - Arbetsliv 2025 - SVT.pdf');
    expect(facit.page).toBe(10);
    expect(facit.language).toBe('sv');

    expect(facit.text_extraction.should_contain).toContain('orosmoment');
    expect(facit.text_extraction.should_contain).toContain('61%');
    expect(facit.text_extraction.min_chars).toBe(1000);
    expect(facit.text_extraction.garbled).toBe(false);

    expect(facit.vision.page_type).toBe('bar chart');
    expect(facit.vision.title_contains).toBe('orosmoment');
    expect(facit.vision.data_points.length).toBeGreaterThan(10);
    expect(facit.vision.data_points[0]?.label).toContain('dålig chef');
    expect(facit.vision.data_points[0]?.values).toContain('61%');
    expect(facit.vision.should_not_contain).toContain('I cannot');
  });

  it('parses p01 facit YAML with empty data_points', () => {
    const content = loadFixture('ungdomsbarometern-p01.yaml');
    const facit = parseFacit(content);

    expect(facit.page).toBe(1);
    expect(facit.vision.page_type).toBe('cover page');
    expect(facit.vision.data_points).toEqual([]);
  });

  it('throws on missing required fields', () => {
    expect(() => parseFacit('language: sv')).toThrow('Facit missing "source"');
    expect(() => parseFacit('source: x\nlanguage: sv')).toThrow('Facit missing "page"');
    expect(() => parseFacit('source: x\npage: 1')).toThrow('Facit missing "language"');
  });
});

describe('evalFromPipelineJson', () => {
  it('scores p10 pipeline against p10 facit', () => {
    const pipeline = loadJson('ungdomsbarometern-p10_pipeline.json');
    const facit = parseFacit(loadFixture('ungdomsbarometern-p10.yaml'));

    const result = evalFromPipelineJson(pipeline, facit);

    expect(result.page).toBe(10);
    expect(result.source).toBe('© Ungdomsbarometern - Arbetsliv 2025 - SVT.pdf');

    expect(result.visionScore).toBeGreaterThan(0.3);
    expect(result.details.textContains.some((tc) => tc.expected === 'orosmoment' && tc.found)).toBe(true);
    expect(result.details.visionType.match).toBe(true);
    expect(result.details.visionType.expected).toBe('bar chart');

    const dpWithHits = result.details.dataPoints.filter((dp) => dp.accuracy > 0);
    expect(dpWithHits.length).toBeGreaterThan(5);

    expect(result.details.negativesClean.every((nc) => !nc.found)).toBe(true);
    expect(result.combinedScore).toBeGreaterThan(0.2);
    expect(result.combinedScore).toBeLessThanOrEqual(1.0);
  });

  it('scores p01 pipeline against p01 facit', () => {
    const pipeline = loadJson('ungdomsbarometern-p01_pipeline.json');
    const facit = parseFacit(loadFixture('ungdomsbarometern-p01.yaml'));

    const result = evalFromPipelineJson(pipeline, facit);

    expect(result.page).toBe(1);
    expect(result.details.textContains.some((tc) => tc.expected === 'UNGDOMSBAROMETERN 2025' && tc.found)).toBe(true);
    expect(result.details.negativesClean.every((nc) => !nc.found)).toBe(true);
  });

  it('returns low score when pipeline output is empty', () => {
    const emptyPipeline = {
      combinedText: '',
      combinedCharCount: 0,
      textExtraction: { method: 'none', text: '', charCount: 0, garbled: true },
      vision: null,
    };

    const facit: Facit = {
      source: 'test.pdf',
      page: 1,
      language: 'en',
      text_extraction: {
        should_contain: ['important text'],
        min_chars: 100,
        garbled: false,
      },
      vision: {
        page_type: 'bar chart',
        title_contains: 'test title',
        data_points: [{ label: 'A', values: ['50%'] }],
        language: 'en',
        should_not_contain: [],
      },
    };

    const result = evalFromPipelineJson(emptyPipeline, facit);

    expect(result.textScore).toBeLessThan(0.5);
    expect(result.visionScore).toBeLessThan(0.5);
    expect(result.combinedScore).toBeLessThan(0.5);
  });

  it('penalizes forbidden strings in vision', () => {
    const pipeline = {
      combinedText: 'some text',
      combinedCharCount: 9,
      textExtraction: { method: 'pypdfium2', text: 'some text', charCount: 9, garbled: false },
      vision: { description: 'I cannot determine the content. PAGE TYPE: unknown', model: 'test' },
    };

    const facit: Facit = {
      source: 'test.pdf',
      page: 1,
      language: 'en',
      text_extraction: { should_contain: [], min_chars: 0, garbled: false },
      vision: {
        page_type: 'text',
        title_contains: '',
        data_points: [],
        language: 'en',
        should_not_contain: ['I cannot'],
      },
    };

    const result = evalFromPipelineJson(pipeline, facit);
    const forbidden = result.details.negativesClean.find((nc) => nc.forbidden === 'I cannot');
    expect(forbidden?.found).toBe(true);
  });
});

describe('formatEvalSummary', () => {
  it('formats single result', () => {
    const results: EvalResult[] = [{
      page: 10,
      source: 'test.pdf',
      textScore: 0.85,
      visionScore: 0.70,
      combinedScore: 0.76,
      details: {
        textContains: [
          { expected: 'foo', found: true },
          { expected: 'bar', found: false },
        ],
        textMinChars: { expected: 100, actual: 200, pass: true },
        textGarbled: { expected: false, actual: false, pass: true },
        visionType: { expected: 'bar chart', actual: 'bar chart', match: true },
        visionTitle: { expected: 'test', found: true },
        dataPoints: [
          { label: 'A', expected: ['50%'], found: ['50%'], accuracy: 1.0 },
          { label: 'B', expected: ['30%'], found: [], accuracy: 0.0 },
        ],
        negativesClean: [],
      },
    }];

    const summary = formatEvalSummary(results);
    expect(summary).toContain('test.pdf sid 10');
    expect(summary).toContain('Text:');
    expect(summary).toContain('Vision:');
    expect(summary).toContain('Combined:');
  });

  it('formats multiple results with average', () => {
    const results: EvalResult[] = [
      {
        page: 1, source: 'test.pdf', textScore: 0.80, visionScore: 0.60, combinedScore: 0.68,
        details: { textContains: [], textMinChars: { expected: 0, actual: 0, pass: true }, textGarbled: { expected: false, actual: false, pass: true }, visionType: { expected: '', actual: '', match: true }, visionTitle: { expected: '', found: true }, dataPoints: [], negativesClean: [] },
      },
      {
        page: 10, source: 'test.pdf', textScore: 0.90, visionScore: 0.80, combinedScore: 0.84,
        details: { textContains: [], textMinChars: { expected: 0, actual: 0, pass: true }, textGarbled: { expected: false, actual: false, pass: true }, visionType: { expected: '', actual: '', match: true }, visionTitle: { expected: '', found: true }, dataPoints: [], negativesClean: [] },
      },
    ];

    const summary = formatEvalSummary(results);
    expect(summary).toContain('Average:');
    expect(summary).toContain('2 pages');
  });
});

describe('normalizedValueMatch', () => {
  it('matches identical strings', () => {
    expect(normalizedValueMatch('61%', '61%')).toBe(true);
  });

  it('matches percentage with space before %', () => {
    expect(normalizedValueMatch('61%', '61 %')).toBe(true);
  });

  it('matches Swedish decimal comma', () => {
    expect(normalizedValueMatch('61%', '61,0%')).toBe(true);
  });

  it('matches decimal fraction to percentage', () => {
    expect(normalizedValueMatch('61%', '0.61')).toBe(true);
  });

  it('matches percentage without % sign', () => {
    expect(normalizedValueMatch('61%', '61')).toBe(true);
  });

  it('rejects values outside tolerance', () => {
    expect(normalizedValueMatch('61%', '65%')).toBe(false);
  });

  it('matches within custom tolerance', () => {
    expect(normalizedValueMatch('61%', '62%', 2.0)).toBe(true);
  });

  it('handles non-numeric strings gracefully', () => {
    expect(normalizedValueMatch('foo', 'bar')).toBe(false);
  });

  it('matches exact substring as fast path', () => {
    expect(normalizedValueMatch('bar chart', 'PAGE TYPE: bar chart')).toBe(true);
  });
});

describe('fuzzyContains', () => {
  it('matches exact substring', () => {
    expect(fuzzyContains('this is a bar chart', 'bar chart')).toBe(true);
  });

  it('matches underscore vs space (bar_chart vs bar chart)', () => {
    expect(fuzzyContains('type: bar chart with data', 'bar_chart')).toBe(true);
  });

  it('matches case-insensitive', () => {
    expect(fuzzyContains('Bar Chart', 'bar chart')).toBe(true);
  });

  it('matches en-dash vs hyphen', () => {
    expect(fuzzyContains('year 2020\u20132025', '2020-2025')).toBe(true);
  });

  it('matches smart quotes vs simple quotes', () => {
    expect(fuzzyContains('the \u201ctest\u201d result', "'test'")).toBe(true);
  });

  it('collapses extra whitespace', () => {
    expect(fuzzyContains('bar   chart  data', 'bar chart')).toBe(true);
  });

  it('rejects non-matching strings', () => {
    expect(fuzzyContains('pie chart', 'bar chart')).toBe(false);
  });
});

describe('evalFromPipelineJson with fuzzy scoring', () => {
  it('matches data point values with space before %', () => {
    const pipeline = {
      combinedText: 'some text about work',
      combinedCharCount: 20,
      textExtraction: { method: 'pypdfium2', text: 'some text', charCount: 20, garbled: false },
      vision: { description: 'PAGE TYPE: bar chart\nDATA:\n| Label | Value |\n| Work | 61 % |', model: 'test' },
    };

    const facit: Facit = {
      source: 'test.pdf',
      page: 1,
      language: 'sv',
      text_extraction: { should_contain: [], min_chars: 0, garbled: false },
      vision: {
        page_type: 'bar chart',
        title_contains: '',
        data_points: [{ label: 'Work', values: ['61%'] }],
        language: 'sv',
        should_not_contain: [],
      },
    };

    const result = evalFromPipelineJson(pipeline, facit);
    expect(result.details.dataPoints[0]?.accuracy).toBe(1.0);
    expect(result.details.dataPoints[0]?.found).toContain('61%');
  });

  it('matches page_type with underscore variation', () => {
    const pipeline = {
      combinedText: '',
      combinedCharCount: 0,
      textExtraction: { method: 'none', text: '', charCount: 0, garbled: false },
      vision: { description: 'PAGE TYPE: bar chart\nTitle: test', model: 'test' },
    };

    const facit: Facit = {
      source: 'test.pdf',
      page: 1,
      language: 'en',
      text_extraction: { should_contain: [], min_chars: 0, garbled: false },
      vision: {
        page_type: 'bar_chart',
        title_contains: '',
        data_points: [],
        language: 'en',
        should_not_contain: [],
      },
    };

    const result = evalFromPipelineJson(pipeline, facit);
    expect(result.details.visionType.match).toBe(true);
  });

  it('still penalizes should_not_contain with exact matching', () => {
    const pipeline = {
      combinedText: '',
      combinedCharCount: 0,
      textExtraction: { method: 'none', text: '', charCount: 0, garbled: false },
      vision: { description: 'I cannot determine this. PAGE TYPE: unknown', model: 'test' },
    };

    const facit: Facit = {
      source: 'test.pdf',
      page: 1,
      language: 'en',
      text_extraction: { should_contain: [], min_chars: 0, garbled: false },
      vision: {
        page_type: 'unknown',
        title_contains: '',
        data_points: [],
        language: 'en',
        should_not_contain: ['I cannot'],
      },
    };

    const result = evalFromPipelineJson(pipeline, facit);
    expect(result.details.negativesClean[0]?.found).toBe(true);
  });
});
