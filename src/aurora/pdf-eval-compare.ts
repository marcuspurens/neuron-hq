import { readFile, readdir } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { evalPdfPage } from './pdf-eval.js';
import { getPdfVisionPrompt } from './ocr.js';
import type { EvalResult } from './types.js';

export interface CompareResult {
  promptALabel: string;
  promptBLabel: string;
  promptAResults: EvalResult[];
  promptBResults: EvalResult[];
  promptAAvg: number;
  promptBAvg: number;
  delta: number;
  perPage: Array<{
    page: number;
    source: string;
    scoreA: number;
    scoreB: number;
    delta: number;
  }>;
  improved: number;
  degraded: number;
  unchanged: number;
}

export async function resolvePrompt(promptArg: string): Promise<string> {
  if (promptArg === 'current') {
    return getPdfVisionPrompt();
  }
  return readFile(resolve(promptArg), 'utf-8');
}

async function collectFacitPaths(facitDir: string): Promise<string[]> {
  const entries = await readdir(facitDir);
  return entries
    .filter((e) => extname(e) === '.yaml')
    .sort()
    .map((e) => join(facitDir, e));
}

export async function comparePrompts(
  pdfPath: string,
  facitDir: string,
  promptAText: string,
  promptBText: string,
  promptALabel: string,
  promptBLabel: string,
): Promise<CompareResult> {
  const facitPaths = await collectFacitPaths(facitDir);

  if (facitPaths.length === 0) {
    throw new Error('No .yaml facit files found in directory');
  }

  const promptAResults: EvalResult[] = [];
  const promptBResults: EvalResult[] = [];

  for (const facitPath of facitPaths) {
    const resultA = await evalPdfPage(resolve(pdfPath), facitPath, { visionPrompt: promptAText });
    promptAResults.push(resultA);

    const resultB = await evalPdfPage(resolve(pdfPath), facitPath, { visionPrompt: promptBText });
    promptBResults.push(resultB);
  }

  const avg = (rs: EvalResult[]) =>
    rs.length > 0 ? rs.reduce((s, r) => s + r.combinedScore, 0) / rs.length : 0;

  const promptAAvg = avg(promptAResults);
  const promptBAvg = avg(promptBResults);

  const perPage = promptAResults.map((a, i) => {
    const b = promptBResults[i]!;
    return {
      page: a.page,
      source: a.source,
      scoreA: a.combinedScore,
      scoreB: b.combinedScore,
      delta: Math.round((b.combinedScore - a.combinedScore) * 100) / 100,
    };
  });

  const THRESHOLD = 0.02;
  const improved = perPage.filter((p) => p.delta > THRESHOLD).length;
  const degraded = perPage.filter((p) => p.delta < -THRESHOLD).length;
  const unchanged = perPage.length - improved - degraded;

  return {
    promptALabel,
    promptBLabel,
    promptAResults,
    promptBResults,
    promptAAvg: Math.round(promptAAvg * 100) / 100,
    promptBAvg: Math.round(promptBAvg * 100) / 100,
    delta: Math.round((promptBAvg - promptAAvg) * 100) / 100,
    perPage,
    improved,
    degraded,
    unchanged,
  };
}

export function formatCompareResult(result: CompareResult): string {
  const lines: string[] = [];

  const pctA = Math.round(result.promptAAvg * 100);
  const pctB = Math.round(result.promptBAvg * 100);
  const sign = result.delta >= 0 ? '+' : '';
  const deltaPct = Math.round(result.delta * 100);

  lines.push(`Prompt A (${result.promptALabel}):  avg ${pctA}%`);
  lines.push(`Prompt B (${result.promptBLabel}):  avg ${pctB}% (${sign}${deltaPct}pp)`);
  lines.push(`  Vision improved on ${result.improved}/${result.perPage.length} pages`);
  lines.push(`  Vision degraded on ${result.degraded}/${result.perPage.length} pages`);
  lines.push(`  Unchanged: ${result.unchanged}/${result.perPage.length} pages`);
  lines.push('');

  lines.push('Per page:');
  for (const p of result.perPage) {
    const pSign = p.delta >= 0 ? '+' : '';
    const icon = p.delta > 0.02 ? '📈' : p.delta < -0.02 ? '📉' : '➡️';
    lines.push(
      `  ${icon} ${p.source} p${p.page}: ${Math.round(p.scoreA * 100)}% → ${Math.round(p.scoreB * 100)}% (${pSign}${Math.round(p.delta * 100)}pp)`,
    );
  }

  return lines.join('\n');
}
