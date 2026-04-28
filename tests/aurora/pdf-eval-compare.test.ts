import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const mockDiagnosePdfPage = vi.fn();
vi.mock('../../src/aurora/ocr.js', async (importOriginal) => {
  const orig = (await importOriginal()) as Record<string, unknown>;
  return {
    ...orig,
    diagnosePdfPage: (...args: unknown[]) => mockDiagnosePdfPage(...args),
  };
});

import { resolvePrompt, comparePrompts, formatCompareResult } from '../../src/aurora/pdf-eval-compare.js';
import { getPdfVisionPrompt } from '../../src/aurora/ocr.js';
import type { PageDigest } from '../../src/aurora/ocr.js';

function makeDigest(page: number, visionDesc: string): PageDigest {
  return {
    page,
    textExtraction: {
      method: 'docling',
      text: 'Some extracted text with arbetsgivare and leda andra',
      charCount: 600,
      garbled: false,
    },
    ocrFallback: null,
    vision: {
      model: 'qwen3-vl:8b',
      description: visionDesc,
      textOnly: false,
      tokensEstimate: 100,
    },
    combinedText: `[Page ${page}]\nSome extracted text with arbetsgivare and leda andra\n\n[Visual content: ${visionDesc}]`,
    combinedCharCount: 200,
  };
}

describe('resolvePrompt', () => {
  it('returns getPdfVisionPrompt() for "current"', async () => {
    const prompt = await resolvePrompt('current');
    const expected = await getPdfVisionPrompt();
    expect(prompt).toBe(expected);
    expect(prompt).toContain('Analyze this PDF page');
  });

  it('reads prompt from file', async () => {
    const dir = join(tmpdir(), `eval-compare-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const promptFile = join(dir, 'prompt-v2.txt');
    await writeFile(promptFile, 'My custom vision prompt');

    try {
      const prompt = await resolvePrompt(promptFile);
      expect(prompt).toBe('My custom vision prompt');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('comparePrompts', () => {
  let facitDir: string;

  beforeEach(async () => {
    mockDiagnosePdfPage.mockReset();
    facitDir = join(tmpdir(), `eval-compare-facit-${Date.now()}`);
    await mkdir(facitDir, { recursive: true });

    await writeFile(
      join(facitDir, 'test-p1.yaml'),
      `source: test.pdf
page: 1
language: sv
text_extraction:
  should_contain:
    - arbetsgivare
  min_chars: 100
  garbled: false
vision:
  page_type: bar chart
  title_contains: ''
  data_points: []
  language: sv
  should_not_contain: []
`,
    );
  });

  it('compares two prompts and returns structured result', async () => {
    mockDiagnosePdfPage
      .mockResolvedValueOnce(
        makeDigest(1, 'PAGE TYPE: bar chart\nTITLE: Test\nDATA: A: 50%'),
      )
      .mockResolvedValueOnce(
        makeDigest(1, 'PAGE TYPE: bar chart\nTITLE: Better Test\nDATA: A: 50%\nB: 30%'),
      );

    const result = await comparePrompts(
      '/test/doc.pdf',
      facitDir,
      'prompt A text',
      'prompt B text',
      'v1',
      'v2',
    );

    expect(result.promptALabel).toBe('v1');
    expect(result.promptBLabel).toBe('v2');
    expect(result.promptAResults).toHaveLength(1);
    expect(result.promptBResults).toHaveLength(1);
    expect(typeof result.promptAAvg).toBe('number');
    expect(typeof result.delta).toBe('number');
    expect(result.perPage).toHaveLength(1);
    expect(result.perPage[0]?.page).toBe(1);

    expect(mockDiagnosePdfPage).toHaveBeenCalledTimes(2);
    expect(mockDiagnosePdfPage).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.objectContaining({ visionPrompt: 'prompt A text' }),
    );
    expect(mockDiagnosePdfPage).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.objectContaining({ visionPrompt: 'prompt B text' }),
    );

    await rm(facitDir, { recursive: true, force: true });
  });

  it('throws on empty facit directory', async () => {
    const emptyDir = join(tmpdir(), `eval-compare-empty-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });

    await expect(
      comparePrompts('/test/doc.pdf', emptyDir, 'a', 'b', 'A', 'B'),
    ).rejects.toThrow('No .yaml facit files');

    await rm(emptyDir, { recursive: true, force: true });
  });
});

describe('formatCompareResult', () => {
  it('produces readable comparison output', () => {
    const output = formatCompareResult({
      promptALabel: 'current',
      promptBLabel: 'v2',
      promptAResults: [],
      promptBResults: [],
      promptAAvg: 0.77,
      promptBAvg: 0.84,
      delta: 0.07,
      perPage: [
        { page: 1, source: 'test.pdf', scoreA: 0.77, scoreB: 0.84, delta: 0.07 },
      ],
      improved: 1,
      degraded: 0,
      unchanged: 0,
    });

    expect(output).toContain('Prompt A (current)');
    expect(output).toContain('Prompt B (v2)');
    expect(output).toContain('improved on 1/1');
    expect(output).toContain('degraded on 0/1');
    expect(output).toContain('77%');
    expect(output).toContain('84%');
  });
});
