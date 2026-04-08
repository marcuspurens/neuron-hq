/**
 * PDF eval runner — scores pipeline output against facit YAML.
 * See docs/plans/PLAN-pdf-eval-loop-2026-04-04.md for design.
 */

import { readFile, readdir } from 'fs/promises';
import { resolve, extname, join } from 'path';
import yaml from 'yaml';
import type { Facit, EvalResult } from './types.js';
import { diagnosePdfPage } from './ocr.js';

/**
 * Load and parse a facit YAML file.
 * Validates required fields — throws on malformed input.
 */
export function parseFacit(content: string): Facit {
  const raw = yaml.parse(content) as Record<string, unknown>;

  if (typeof raw.source !== 'string') throw new Error('Facit missing "source"');
  if (typeof raw.page !== 'number') throw new Error('Facit missing "page"');
  if (typeof raw.language !== 'string') throw new Error('Facit missing "language"');

  const te = raw.text_extraction as Record<string, unknown> | undefined;
  if (!te) throw new Error('Facit missing "text_extraction"');

  const vis = raw.vision as Record<string, unknown> | undefined;
  if (!vis) throw new Error('Facit missing "vision"');

  return {
    source: raw.source as string,
    page: raw.page as number,
    language: raw.language as string,
    text_extraction: {
      should_contain: (te.should_contain as string[]) ?? [],
      min_chars: (te.min_chars as number) ?? 0,
      garbled: (te.garbled as boolean) ?? false,
    },
    vision: {
      page_type: (vis.page_type as string) ?? '',
      title_contains: (vis.title_contains as string) ?? '',
      data_points: (vis.data_points as Facit['vision']['data_points']) ?? [],
      language: (vis.language as string) ?? '',
      should_not_contain: (vis.should_not_contain as string[]) ?? [],
    },
  };
}

/**
 * Score text extraction against facit.
 * Returns 0.0–1.0 and per-assertion details.
 */
function scoreText(
  pipelineText: string,
  charCount: number,
  garbled: boolean,
  facit: Facit['text_extraction'],
): {
  score: number;
  textContains: EvalResult['details']['textContains'];
  textMinChars: EvalResult['details']['textMinChars'];
  textGarbled: EvalResult['details']['textGarbled'];
} {
  const lowerText = pipelineText.toLowerCase();

  const textContains = facit.should_contain.map((expected) => ({
    expected,
    found: lowerText.includes(expected.toLowerCase()),
  }));

  const textMinChars = {
    expected: facit.min_chars,
    actual: charCount,
    pass: charCount >= facit.min_chars,
  };

  const textGarbled = {
    expected: facit.garbled,
    actual: garbled,
    pass: garbled === facit.garbled,
  };

  const containsHits = textContains.filter((tc) => tc.found).length;
  const containsTotal = Math.max(textContains.length, 1);
  const containsScore = containsHits / containsTotal;
  const minCharsScore = textMinChars.pass ? 1.0 : 0.0;
  const garbledScore = textGarbled.pass ? 1.0 : 0.0;

  // Weighted: 60% string matches, 20% min chars, 20% garbled check
  const score = containsScore * 0.6 + minCharsScore * 0.2 + garbledScore * 0.2;

  return { score, textContains, textMinChars, textGarbled };
}

/**
 * Score vision output against facit.
 * Returns 0.0–1.0 and per-assertion details.
 */
function scoreVision(
  visionDescription: string | null,
  facit: Facit['vision'],
): {
  score: number;
  visionType: EvalResult['details']['visionType'];
  visionTitle: EvalResult['details']['visionTitle'];
  dataPoints: EvalResult['details']['dataPoints'];
  negativesClean: EvalResult['details']['negativesClean'];
} {
  const desc = (visionDescription ?? '').toLowerCase();

  const visionType = {
    expected: facit.page_type,
    actual: extractPageTypeFromDesc(desc),
    match: desc.includes(facit.page_type.toLowerCase()),
  };

  const visionTitle = {
    expected: facit.title_contains,
    found: facit.title_contains ? desc.includes(facit.title_contains.toLowerCase()) : true,
  };

  const dataPoints = facit.data_points.map((dp) => {
    const found: string[] = [];
    for (const val of dp.values) {
      if (desc.includes(val.toLowerCase())) {
        found.push(val);
      }
    }
    const accuracy = dp.values.length > 0 ? found.length / dp.values.length : 1.0;
    return { label: dp.label, expected: dp.values, found, accuracy };
  });

  const negativesClean = facit.should_not_contain.map((forbidden) => ({
    forbidden,
    found: desc.includes(forbidden.toLowerCase()),
  }));

  const typeScore = visionType.match ? 1.0 : 0.0;
  const titleScore = visionTitle.found ? 1.0 : 0.0;

  const dpAccuracies = dataPoints.map((dp) => dp.accuracy);
  const dpScore = dpAccuracies.length > 0
    ? dpAccuracies.reduce((a, b) => a + b, 0) / dpAccuracies.length
    : 1.0;

  const negativeViolations = negativesClean.filter((nc) => nc.found).length;
  const negativePenalty = negativeViolations > 0 ? 0.2 * negativeViolations : 0.0;

  // Weighted: 20% type, 10% title, 60% data, 10% negatives
  const raw = typeScore * 0.2 + titleScore * 0.1 + dpScore * 0.6 + (1.0 - Math.min(negativePenalty, 1.0)) * 0.1;
  const score = Math.max(0.0, Math.min(1.0, raw));

  return { score, visionType, visionTitle, dataPoints, negativesClean };
}

function extractPageTypeFromDesc(desc: string): string {
  const match = desc.match(/page\s*type:\s*(.+?)(?:\n|$)/i);
  return match?.[1]?.trim() ?? 'unknown';
}

/**
 * Evaluate a single PDF page against a facit file.
 *
 * Runs diagnosePdfPage() on the specified page, then scores against facit.
 */
export async function evalPdfPage(
  pdfPath: string,
  facitPath: string,
  options?: { visionPrompt?: string },
): Promise<EvalResult> {
  const facitContent = await readFile(facitPath, 'utf-8');
  const facit = parseFacit(facitContent);

  const digest = await diagnosePdfPage(resolve(pdfPath), facit.page, {
    visionPrompt: options?.visionPrompt,
  });

  const textResult = scoreText(
    digest.combinedText,
    digest.combinedCharCount,
    digest.textExtraction.garbled,
    facit.text_extraction,
  );

  const visionResult = scoreVision(
    digest.vision?.description ?? null,
    facit.vision,
  );

  // Combined: 40% text, 60% vision
  const combinedScore = textResult.score * 0.4 + visionResult.score * 0.6;

  return {
    page: facit.page,
    source: facit.source,
    textScore: Math.round(textResult.score * 100) / 100,
    visionScore: Math.round(visionResult.score * 100) / 100,
    combinedScore: Math.round(combinedScore * 100) / 100,
    details: {
      textContains: textResult.textContains,
      textMinChars: textResult.textMinChars,
      textGarbled: textResult.textGarbled,
      visionType: visionResult.visionType,
      visionTitle: visionResult.visionTitle,
      dataPoints: visionResult.dataPoints,
      negativesClean: visionResult.negativesClean,
    },
  };
}

/**
 * Evaluate a single PDF page using pre-loaded pipeline JSON (no live pipeline run).
 * Useful for unit tests and offline scoring.
 */
export function evalFromPipelineJson(
  pipelineJson: Record<string, unknown>,
  facit: Facit,
): EvalResult {
  const combinedText = (pipelineJson.combinedText as string) ?? '';
  const combinedCharCount = (pipelineJson.combinedCharCount as number) ?? combinedText.length;
  const textExtraction = pipelineJson.textExtraction as Record<string, unknown> | undefined;
  const garbled = (textExtraction?.garbled as boolean) ?? false;

  const vision = pipelineJson.vision as Record<string, unknown> | undefined;
  const visionDescription = (vision?.description as string) ?? null;

  const textResult = scoreText(combinedText, combinedCharCount, garbled, facit.text_extraction);
  const visionResult = scoreVision(visionDescription, facit.vision);

  const combinedScore = textResult.score * 0.4 + visionResult.score * 0.6;

  return {
    page: facit.page,
    source: facit.source,
    textScore: Math.round(textResult.score * 100) / 100,
    visionScore: Math.round(visionResult.score * 100) / 100,
    combinedScore: Math.round(combinedScore * 100) / 100,
    details: {
      textContains: textResult.textContains,
      textMinChars: textResult.textMinChars,
      textGarbled: textResult.textGarbled,
      visionType: visionResult.visionType,
      visionTitle: visionResult.visionTitle,
      dataPoints: visionResult.dataPoints,
      negativesClean: visionResult.negativesClean,
    },
  };
}

/**
 * Evaluate all facit files in a directory.
 * Finds *.yaml files and their matching *_pipeline.json files.
 */
export async function evalDirectory(
  pdfPath: string,
  facitDir: string,
): Promise<EvalResult[]> {
  const entries = await readdir(facitDir);
  const yamlFiles = entries.filter((e) => extname(e) === '.yaml');

  const results: EvalResult[] = [];
  for (const yamlFile of yamlFiles) {
    const facitPath = join(facitDir, yamlFile);
    const result = await evalPdfPage(pdfPath, facitPath);
    results.push(result);
  }

  return results;
}

/** Format eval results as a human-readable summary string. */
export function formatEvalSummary(results: EvalResult[]): string {
  const lines: string[] = [];

  for (const r of results) {
    const textPct = Math.round(r.textScore * 100);
    const visionPct = Math.round(r.visionScore * 100);
    const combinedPct = Math.round(r.combinedScore * 100);
    const dpTotal = r.details.dataPoints.length;
    const dpHits = r.details.dataPoints.filter((dp) => dp.accuracy >= 0.5).length;
    const textHits = r.details.textContains.filter((tc) => tc.found).length;
    const textTotal = r.details.textContains.length;

    lines.push(`📊 Eval: ${r.source} sid ${r.page}`);
    lines.push(`   Text:     ${textPct}% (${textHits}/${textTotal} expected strings found)`);
    lines.push(`   Vision:   ${visionPct}% (page_type: ${r.details.visionType.match ? '✓' : '✗'}, title: ${r.details.visionTitle.found ? '✓' : '✗'}, data: ${dpHits}/${dpTotal})`);
    lines.push(`   Combined: ${combinedPct}%`);
    lines.push('');
  }

  if (results.length > 1) {
    const avg = results.reduce((sum, r) => sum + r.combinedScore, 0) / results.length;
    lines.push('━'.repeat(40));
    lines.push(`Average: ${Math.round(avg * 100)}% (${results.length} pages)`);
  }

  return lines.join('\n');
}
