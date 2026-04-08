import { describe, it, expect } from 'vitest';
import { classifyPage } from '../../src/aurora/page-classifier.js';
import type { PageDigest } from '../../src/aurora/ocr.js';

function makeDigest(overrides: Partial<PageDigest> = {}): PageDigest {
  return {
    page: 1,
    textExtraction: {
      method: 'pypdfium2',
      text: 'Some text content here',
      charCount: 22,
      garbled: false,
    },
    ocrFallback: null,
    vision: null,
    combinedText: 'Some text content here',
    combinedCharCount: 22,
    ...overrides,
  };
}

describe('classifyPage', () => {
  describe('vision-based classification', () => {
    it('classifies bar chart from PAGE TYPE field', () => {
      const digest = makeDigest({
        vision: {
          model: 'test',
          description: 'PAGE TYPE: bar chart\nTITLE: Some title\nDATA: None\nKEY FINDING: Something\nLANGUAGE: Swedish',
          textOnly: false,
          tokensEstimate: 50,
        },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('bar_chart');
      expect(result.chartType).toBe('horizontal_bar');
      expect(result.pageTypeConfidence).toBeGreaterThanOrEqual(0.9);
      expect(result.title).toBe('Some title');
      expect(result.keyFinding).toBe('Something');
    });

    it('classifies infographic', () => {
      const digest = makeDigest({
        vision: {
          model: 'test',
          description: 'PAGE TYPE: infographic\n\nTITLE: UNGDOMSBAROMETERN 2025\n\nDATA: None\n\nKEY FINDING: Cover page\n\nLANGUAGE: Swedish',
          textOnly: false,
          tokensEstimate: 30,
        },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('infographic');
      expect(result.chartType).toBeNull();
      expect(result.title).toBe('UNGDOMSBAROMETERN 2025');
    });

    it('parses markdown table data points', () => {
      const description = [
        'PAGE TYPE: bar chart',
        'TITLE: Orosmoment',
        'DATA:',
        '| Label | Value |',
        '| :--- | :--- |',
        '| Dålig chef | 61% |',
        '| Inte trivas | 58% |',
        '| Låg lön | 55% |',
        'KEY FINDING: Bad leadership tops concerns',
        'LANGUAGE: Swedish',
      ].join('\n');

      const digest = makeDigest({
        vision: { model: 'test', description, textOnly: false, tokensEstimate: 100 },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('bar_chart');
      expect(result.dataPoints).toHaveLength(3);
      expect(result.dataPoints[0]).toEqual({ label: 'Dålig chef', values: ['61%'] });
      expect(result.dataPoints[1]).toEqual({ label: 'Inte trivas', values: ['58%'] });
      expect(result.dataPoints[2]).toEqual({ label: 'Låg lön', values: ['55%'] });
    });

    it('handles DATA: None', () => {
      const digest = makeDigest({
        vision: {
          model: 'test',
          description: 'PAGE TYPE: cover\nTITLE: Test\nDATA: None\nKEY FINDING: A cover page\nLANGUAGE: Swedish',
          textOnly: false,
          tokensEstimate: 20,
        },
      });

      const result = classifyPage(digest);
      expect(result.dataPoints).toEqual([]);
    });

    it('classifies table', () => {
      const digest = makeDigest({
        vision: {
          model: 'test',
          description: 'PAGE TYPE: table\nTITLE: Results\nDATA: None\nKEY FINDING: Summary table\nLANGUAGE: English',
          textOnly: false,
          tokensEstimate: 20,
        },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('table');
      expect(result.chartType).toBeNull();
    });

    it('returns unknown for unrecognized page type', () => {
      const digest = makeDigest({
        vision: {
          model: 'test',
          description: 'PAGE TYPE: something very unusual and new\nTITLE: X\nDATA: None\nKEY FINDING: Y\nLANGUAGE: Z',
          textOnly: false,
          tokensEstimate: 20,
        },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('unknown');
      expect(result.pageTypeConfidence).toBeLessThanOrEqual(0.3);
    });

    it('uses partial match for composite types', () => {
      const digest = makeDigest({
        vision: {
          model: 'test',
          description: 'PAGE TYPE: horizontal bar chart with annotations\nTITLE: X\nDATA: None\nKEY FINDING: Y\nLANGUAGE: Z',
          textOnly: false,
          tokensEstimate: 20,
        },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('bar_chart');
      expect(result.chartType).toBe('horizontal_bar');
      expect(result.pageTypeConfidence).toBe(0.7);
    });

    it('skips vision when textOnly is true', () => {
      const digest = makeDigest({
        page: 5,
        textExtraction: {
          method: 'pypdfium2',
          text: 'A'.repeat(300),
          charCount: 300,
          garbled: false,
        },
        vision: {
          model: 'test',
          description: 'TEXT_ONLY',
          textOnly: true,
          tokensEstimate: 5,
        },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('text');
      expect(result.signals.visionTextOnly).toBe(true);
    });
  });

  describe('text heuristic fallback', () => {
    it('classifies blank page', () => {
      const digest = makeDigest({
        textExtraction: { method: 'pypdfium2', text: '', charCount: 0, garbled: false },
        combinedCharCount: 0,
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('blank');
    });

    it('classifies first page with short text as cover', () => {
      const digest = makeDigest({
        page: 1,
        textExtraction: { method: 'pypdfium2', text: 'Title Page', charCount: 10, garbled: false },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('cover');
    });

    it('classifies page with many dot leaders as table of contents', () => {
      const text = 'Chapter 1 ....... 3\nChapter 2 ....... 15\nChapter 3 ....... 27\nChapter 4 ....... 42';
      const digest = makeDigest({
        page: 2,
        textExtraction: { method: 'pypdfium2', text, charCount: text.length, garbled: false },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('table_of_contents');
    });

    it('classifies long text as text page', () => {
      const text = 'A'.repeat(500);
      const digest = makeDigest({
        page: 5,
        textExtraction: { method: 'pypdfium2', text, charCount: 500, garbled: false },
      });

      const result = classifyPage(digest);
      expect(result.pageType).toBe('text');
    });
  });

  describe('signals', () => {
    it('captures debug signals correctly', () => {
      const digest = makeDigest({
        page: 10,
        textExtraction: { method: 'docling', text: 'content', charCount: 288, garbled: false },
        ocrFallback: { triggered: true, text: 'ocr content', charCount: 200 },
        vision: {
          model: 'aurora-vision-extract',
          description: 'PAGE TYPE: bar chart\nTITLE: Test\nDATA: None\nKEY FINDING: Test\nLANGUAGE: Swedish',
          textOnly: false,
          tokensEstimate: 50,
        },
      });

      const result = classifyPage(digest);
      expect(result.signals.visionPageType).toBe('bar chart');
      expect(result.signals.visionTextOnly).toBe(false);
      expect(result.signals.textCharCount).toBe(288);
      expect(result.signals.textMethod).toBe('docling');
      expect(result.signals.ocrFallbackTriggered).toBe(true);
      expect(result.signals.visionAvailable).toBe(true);
    });
  });

  describe('real pipeline data', () => {
    it('classifies p01 pipeline JSON as infographic/cover', () => {
      const digest: PageDigest = {
        page: 1,
        textExtraction: { method: 'docling', text: 'TILL: SVT\n\n## UNGDOMSBAROMETERN 2025: ARBETSLIVSRAPPORTEN\n\n<!-- image -->', charCount: 73, garbled: false },
        ocrFallback: null,
        vision: {
          model: 'aurora-vision-extract',
          description: 'PAGE TYPE: infographic\n\nTITLE: UNGDOMSBAROMETERN 2025: ARBETSLIVSRAPPORTEN\n\nDATA: None\n\nKEY FINDING: This is the cover page of the "Ungdomsbarometern 2025: Arbetslivsrapporten" report, addressed to SVT, featuring a young person in work attire.\n\nLANGUAGE: Swedish',
          textOnly: false,
          tokensEstimate: 66,
        },
        combinedText: '',
        combinedCharCount: 364,
      };

      const result = classifyPage(digest);
      expect(result.pageType).toBe('infographic');
      expect(result.title).toBe('UNGDOMSBAROMETERN 2025: ARBETSLIVSRAPPORTEN');
      expect(result.dataPoints).toEqual([]);
    });

    it('classifies p10 pipeline JSON as bar chart with data points', () => {
      const digest: PageDigest = {
        page: 10,
        textExtraction: { method: 'docling', text: 'orosmoment text...', charCount: 288, garbled: false },
        ocrFallback: null,
        vision: {
          model: 'aurora-vision-extract',
          description: 'PAGE TYPE: bar chart\nTITLE: Att få en för låg lön hör även till de främsta orosmomenten\nDATA:\n| Label | Value |\n| :--- | :--- |\n| Få en dålig chef/dåligt ledarskap | 61% |\n| Inte trivas med kollegorna | 58% |\n| Få för låg lön | 55% |\nKEY FINDING: The most common source of stress is having a bad boss.\nLANGUAGE: Swedish',
          textOnly: false,
          tokensEstimate: 359,
        },
        combinedText: '',
        combinedCharCount: 1753,
      };

      const result = classifyPage(digest);
      expect(result.pageType).toBe('bar_chart');
      expect(result.chartType).toBe('horizontal_bar');
      expect(result.dataPoints.length).toBeGreaterThanOrEqual(3);
      expect(result.dataPoints[0]?.label).toContain('dålig chef');
      expect(result.dataPoints[0]?.values).toContain('61%');
    });
  });
});
