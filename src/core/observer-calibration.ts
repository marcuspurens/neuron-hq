import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricsJson {
  timing?: { duration_seconds?: number };
  tokens?: { total_input?: number; total_output?: number };
  testing?: { baseline_passed?: number; after_passed?: number };
  delegations?: { re_delegations?: number };
}

interface ReviewerResultJson {
  verdict?: string;
}

interface ReviewTurn {
  role?: string;
  content?: string;
}

interface ReviewJson {
  briefFile?: string;
  turns?: ReviewTurn[];
}

// ---------------------------------------------------------------------------
// Exported pure helpers
// ---------------------------------------------------------------------------

/**
 * Classify how accurately the scope was estimated.
 * reDelegations is part of the signature (for future use / testability).
 */
export function classifyScopeAccuracy(
  stoplight: string,
  scopeScore: number,
  durationMin: number,
  _reDelegations: number,
): 'OVER' | 'ACCURATE' | 'UNDER' {
  if (stoplight === 'GREEN' && scopeScore <= 6) return 'OVER';
  if (stoplight === 'GREEN' && durationMin <= 90) return 'ACCURATE';
  return 'UNDER';
}

/**
 * Parse scopeScore, totalScore, and verdict from a reviewer markdown text.
 * Returns null if any field cannot be parsed.
 */
export function parseReviewScores(
  text: string,
): { scopeScore: number; totalScore: number; verdict: string } | null {
  // Parse scopeScore — try primary pattern, then fallback
  let scopeScore: number | null = null;
  const scopeMatch = text.match(/\| Scope[^|]*\|\s*(\d+)\/10\s*\|/);
  if (scopeMatch) {
    scopeScore = Number(scopeMatch[1]);
  } else {
    const fallback = text.match(
      /\| Scope & genomf[^|]*\|\s*(\d+)\/10\s*\|/,
    );
    if (fallback) {
      scopeScore = Number(fallback[1]);
    }
  }

  // Parse totalScore
  const totalMatch = text.match(
    /\| \*\*Totalt\*\*[^|]*\|\s*\*\*(\d+\.?\d*)\/10\*\*\s*\|/,
  );
  const totalScore = totalMatch ? Number(totalMatch[1]) : null;

  // Parse verdict — longest match first to avoid false positive
  let verdict: string | null = null;
  if (text.includes('UNDERKÄND')) {
    verdict = 'UNDERKÄND';
  } else if (text.includes('GODKÄND MED RESERVATIONER')) {
    verdict = 'GODKÄND MED RESERVATIONER';
  } else if (text.includes('GODKÄND')) {
    verdict = 'GODKÄND';
  }

  if (scopeScore === null || totalScore === null || verdict === null) {
    return null;
  }

  return { scopeScore, totalScore, verdict };
}

// ---------------------------------------------------------------------------
// File reading helpers
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    /* intentional: safe fallback for missing/malformed file */
    return null;
  }
}

async function readTextSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    /* intentional: safe fallback for missing file */
    return null;
  }
}

// ---------------------------------------------------------------------------
// Header for review_calibration.md
// ---------------------------------------------------------------------------

const CALIBRATION_HEADER = `# Brief Reviewer — Kalibreringsdata

> Genereras automatiskt av Observer efter varje körning.
> Brief Reviewer läser denna i Fas 0 för att kalibrera sina bedömningar.

| Datum | Körning | Brief | Scope (BR) | Totalt (BR) | Verdict (BR) | Stoplight | Tid (min) | Scope-acc | Verdict-acc |
|-------|---------|-------|------------|-------------|--------------|-----------|-----------|-----------|-------------|
`;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Append a calibration row to memory/review_calibration.md.
 *
 * @param runDir   - Directory of the run (e.g. runs/20260322-0150-neuron-hq)
 * @param baseDir  - Project base directory (contains memory/ and runs/)
 * @param briefFile - The brief filename used in this run (e.g. 'observer-a.md')
 */
export async function appendCalibration(
  runDir: string,
  baseDir: string,
  briefFile: string,
): Promise<void> {
  // Step 1: Extract runid
  const runid = path.basename(runDir);

  // Step 2: Read metrics.json
  const metricsPath = path.join(runDir, 'metrics.json');
  const metrics = await readJsonSafe<MetricsJson>(metricsPath);
  if (!metrics) {
    console.log(`Kalibrering skippades: metrics.json saknas för ${runid}`);
    return;
  }

  // Step 3: Read reviewer_result.json
  const reviewerResultPath = path.join(runDir, 'reviewer_result.json');
  const reviewerResult = await readJsonSafe<ReviewerResultJson>(reviewerResultPath);
  if (!reviewerResult) {
    console.log(`Kalibrering skippades: reviewer_result.json saknas för ${runid}`);
    return;
  }

  // Step 4: Find matching review JSON in baseDir/runs/reviews/
  const reviewsDir = path.join(baseDir, 'runs', 'reviews');
  const matchedReview = await findMatchingReview(reviewsDir, briefFile);
  if (!matchedReview) {
    console.log(
      `Kalibrering skippades: ingen matchande review för ${briefFile}`,
    );
    return;
  }

  // Step 5: Parse review text from last assistant turn
  const reviewText = extractLastAssistantTurn(matchedReview.turns ?? []);
  if (!reviewText) {
    console.log(
      `Kalibrering skippades: ingen assistant-tur i review för ${briefFile}`,
    );
    return;
  }

  const scores = parseReviewScores(reviewText);
  if (!scores) {
    console.log(
      `Kalibrering skippades: kunde inte parsa review-scores för ${briefFile}`,
    );
    return;
  }
  const { scopeScore, totalScore, verdict: reviewVerdict } = scores;

  // Step 6: Extract from metrics.json
  const durationSeconds = metrics.timing?.duration_seconds ?? 0;
  const durationMinutes = Math.round(durationSeconds / 60);
  const reDelegations = metrics.delegations?.re_delegations ?? 0;

  // Step 7: Extract stoplight from reviewer_result.json
  const stoplight = reviewerResult.verdict;
  if (!stoplight) {
    console.log(
      `Kalibrering skippades: verdict saknas i reviewer_result.json för ${runid}`,
    );
    return;
  }

  // Step 8: Classify
  const scopeAccuracy = classifyScopeAccuracy(
    stoplight,
    scopeScore,
    durationMinutes,
    reDelegations,
  );

  const verdictAccuracy = classifyVerdictAccuracy(reviewVerdict, stoplight);

  // Step 9: Read or create review_calibration.md
  const calibrationPath = path.join(baseDir, 'memory', 'review_calibration.md');
  let existingContent = await readTextSafe(calibrationPath);

  if (existingContent === null) {
    // File doesn't exist — create with header
    existingContent = CALIBRATION_HEADER;
  } else {
    // Duplicate protection: check if runid already appears
    if (existingContent.includes(runid)) {
      return;
    }
  }

  // Step 10: Append row
  const date = new Date().toISOString().slice(0, 10);
  const briefShort = path.basename(briefFile, '.md') || briefFile;
  const row = `| ${date} | ${runid} | ${briefShort} | ${scopeScore} | ${totalScore} | ${reviewVerdict} | ${stoplight} | ${durationMinutes} | ${scopeAccuracy} | ${verdictAccuracy} |`;

  const newContent = existingContent.endsWith('\n')
    ? existingContent + row + '\n'
    : existingContent + '\n' + row + '\n';

  await fs.mkdir(path.dirname(calibrationPath), { recursive: true });
  await fs.writeFile(calibrationPath, newContent, 'utf-8');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the first review JSON that matches briefFile using 3-step matching.
 */
async function findMatchingReview(
  reviewsDir: string,
  briefFile: string,
): Promise<ReviewJson | null> {
  let files: string[];
  try {
    const entries = await fs.readdir(reviewsDir);
    files = entries.filter(
      (f) => f.startsWith('review-') && f.endsWith('.json'),
    );
  } catch {
    return null;
  }

  if (files.length === 0) return null;

  const briefBasename = path.basename(briefFile, '.md');

  // Step 4a: match via review.briefFile field (only if briefFile is non-empty)
  if (briefFile) {
    for (const filename of files) {
      const reviewPath = path.join(reviewsDir, filename);
      const review = await readJsonSafe<ReviewJson>(reviewPath);
      if (!review) continue;
      if (review.briefFile) {
        const rb = path.basename(review.briefFile);
        if (
          rb === path.basename(briefFile) ||
          review.briefFile.includes(briefFile)
        ) {
          return review;
        }
      }
    }
  }

  // Step 4b: match via turns[0].content including briefBasename or briefFile
  for (const filename of files) {
    const reviewPath = path.join(reviewsDir, filename);
    const review = await readJsonSafe<ReviewJson>(reviewPath);
    if (!review) continue;
    if (!review.turns || review.turns.length === 0) continue; // guard: skip empty/missing turns
    const firstContent = review.turns[0].content ?? '';
    if (
      (briefBasename && firstContent.includes(briefBasename)) ||
      (briefFile && firstContent.includes(briefFile))
    ) {
      return review;
    }
  }

  return null;
}

/**
 * Extract content of the last 'assistant' turn from the turns array.
 */
function extractLastAssistantTurn(turns: ReviewTurn[]): string | null {
  let lastAssistant: string | null = null;
  for (const turn of turns) {
    if (turn.role === 'assistant' && turn.content) {
      lastAssistant = turn.content;
    }
  }
  return lastAssistant;
}

/**
 * Classify whether the review verdict matches the stoplight verdict.
 */
function classifyVerdictAccuracy(
  reviewVerdict: string,
  stoplight: string,
): 'MATCH' | 'MISMATCH' {
  if (
    (reviewVerdict === 'GODKÄND' ||
      reviewVerdict === 'GODKÄND MED RESERVATIONER') &&
    stoplight === 'GREEN'
  ) {
    return 'MATCH';
  }
  if (
    reviewVerdict === 'UNDERKÄND' &&
    (stoplight === 'YELLOW' || stoplight === 'RED')
  ) {
    return 'MATCH';
  }
  return 'MISMATCH';
}
