import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  appendCalibration,
  classifyScopeAccuracy,
  parseReviewScores,
} from '../../src/core/observer-calibration.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const REVIEW_TEXT_GODKÄND = `
| Scope | 8/10 |
| **Totalt** | **8.6/10** |

## Verdict: GODKÄND
`;

const REVIEW_TEXT_UNDERKÄND = `
| Scope | 5/10 |
| **Totalt** | **4.2/10** |

## Verdict: UNDERKÄND
`;

const REVIEW_TEXT_MED_RESERVATIONER = `
| Scope | 7/10 |
| **Totalt** | **7.5/10** |

## Verdict: GODKÄND MED RESERVATIONER
`;

function makeMetrics(overrides: Record<string, unknown> = {}): object {
  return {
    timing: { duration_seconds: 3660 },
    tokens: { total_input: 10000, total_output: 5000 },
    testing: { baseline_passed: 10, after_passed: 15 },
    delegations: { re_delegations: 0 },
    ...overrides,
  };
}

function makeReviewerResult(verdict = 'GREEN'): object {
  return { verdict };
}

function makeReviewJson(
  briefFile: string,
  reviewText: string,
  turns?: Array<{ role: string; content: string }>,
): object {
  return {
    briefFile,
    turns: turns ?? [
      { role: 'user', content: `Review for ${briefFile}` },
      { role: 'assistant', content: reviewText },
    ],
  };
}

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function setupTempDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-calib-test-'));
  return tmpDir;
}

function cleanupTempDir(): void {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function setupRunDir(
  baseDir: string,
  runid: string,
  metricsData?: object,
  reviewerResultData?: object,
): Promise<string> {
  const runDir = path.join(baseDir, 'runs', runid);
  await fsp.mkdir(runDir, { recursive: true });
  if (metricsData !== undefined) {
    await fsp.writeFile(
      path.join(runDir, 'metrics.json'),
      JSON.stringify(metricsData),
    );
  }
  if (reviewerResultData !== undefined) {
    await fsp.writeFile(
      path.join(runDir, 'reviewer_result.json'),
      JSON.stringify(reviewerResultData),
    );
  }
  return runDir;
}

async function setupReviewFile(
  baseDir: string,
  filename: string,
  data: object,
): Promise<void> {
  const reviewsDir = path.join(baseDir, 'runs', 'reviews');
  await fsp.mkdir(reviewsDir, { recursive: true });
  await fsp.writeFile(
    path.join(reviewsDir, filename),
    JSON.stringify(data),
  );
}

async function readCalibration(baseDir: string): Promise<string | null> {
  const p = path.join(baseDir, 'memory', 'review_calibration.md');
  try {
    return await fsp.readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tests: classifyScopeAccuracy (pure function)
// ---------------------------------------------------------------------------

describe('classifyScopeAccuracy', () => {
  it('OVER: GREEN + scope <= 6', () => {
    expect(classifyScopeAccuracy('GREEN', 6, 60, 0)).toBe('OVER');
    expect(classifyScopeAccuracy('GREEN', 4, 120, 0)).toBe('OVER');
  });

  it('ACCURATE: GREEN + scope > 6 + durationMin <= 90', () => {
    expect(classifyScopeAccuracy('GREEN', 8, 90, 0)).toBe('ACCURATE');
    expect(classifyScopeAccuracy('GREEN', 7, 61, 0)).toBe('ACCURATE');
  });

  it('edge case: GREEN + 95 min + scope 8 => UNDER (not ACCURATE, not OVER)', () => {
    expect(classifyScopeAccuracy('GREEN', 8, 95, 0)).toBe('UNDER');
  });

  it('UNDER: RED regardless of scores', () => {
    expect(classifyScopeAccuracy('RED', 8, 60, 0)).toBe('UNDER');
    expect(classifyScopeAccuracy('RED', 5, 30, 0)).toBe('UNDER');
  });

  it('UNDER: YELLOW regardless of scores', () => {
    expect(classifyScopeAccuracy('YELLOW', 9, 45, 0)).toBe('UNDER');
  });
});

// ---------------------------------------------------------------------------
// Tests: parseReviewScores (pure function)
// ---------------------------------------------------------------------------

describe('parseReviewScores', () => {
  it('parses standard GODKÄND table format', () => {
    const result = parseReviewScores(REVIEW_TEXT_GODKÄND);
    expect(result).not.toBeNull();
    expect(result!.scopeScore).toBe(8);
    expect(result!.totalScore).toBe(8.6);
    expect(result!.verdict).toBe('GODKÄND');
  });

  it('parses UNDERKÄND verdict', () => {
    const result = parseReviewScores(REVIEW_TEXT_UNDERKÄND);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('UNDERKÄND');
    expect(result!.scopeScore).toBe(5);
  });

  it('parses GODKÄND MED RESERVATIONER without false positive GODKÄND', () => {
    const result = parseReviewScores(REVIEW_TEXT_MED_RESERVATIONER);
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe('GODKÄND MED RESERVATIONER');
  });

  it('returns null when scope score is missing', () => {
    const text = `| **Totalt** | **7.0/10** |\nGODKÄND`;
    expect(parseReviewScores(text)).toBeNull();
  });

  it('returns null when total score is missing', () => {
    const text = `| Scope | 8/10 |\nGODKÄND`;
    expect(parseReviewScores(text)).toBeNull();
  });

  it('returns null when verdict is missing', () => {
    const text = `| Scope | 8/10 |\n| **Totalt** | **8.0/10** |`;
    expect(parseReviewScores(text)).toBeNull();
  });

  it('parses various score formats', () => {
    const text = `| Scope & genomförbarhet | 7/10 |\n| **Totalt** | **9.0/10** |\nGODKÄND`;
    const result = parseReviewScores(text);
    // Primary regex matches "Scope" which is a prefix of "Scope & genomförbarhet"
    expect(result).not.toBeNull();
    expect(result!.scopeScore).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Tests: appendCalibration (integration with temp dirs)
// ---------------------------------------------------------------------------

describe('appendCalibration', () => {
  beforeEach(() => {
    setupTempDir();
  });

  afterEach(() => {
    cleanupTempDir();
  });

  // Test 1: Happy path
  it('happy path: creates calibration file with correct row', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0150-neuron-hq';
    const briefFile = 'observer-a.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics({ timing: { duration_seconds: 3660 } }),
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-001.json',
      makeReviewJson(briefFile, REVIEW_TEXT_GODKÄND),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).not.toBeNull();
    expect(content).toContain('# Brief Reviewer — Kalibreringsdata');
    expect(content).toContain(runid);
    expect(content).toContain('observer-a');
    expect(content).toContain('GODKÄND');
    expect(content).toContain('GREEN');
    expect(content).toContain('MATCH');
  });

  // Test 2: Scope accuracy OVER
  it('scope accuracy OVER: GREEN + scope <= 6', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0151-neuron-hq';
    const briefFile = 'observer-b.md';
    const reviewText = `| Scope | 6/10 |\n| **Totalt** | **6.0/10** |\nGODKÄND`;
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics({ timing: { duration_seconds: 3600 } }), // 60 min
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-002.json',
      makeReviewJson(briefFile, reviewText),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).toContain('OVER');
  });

  // Test 3: Scope accuracy ACCURATE
  it('scope accuracy ACCURATE: GREEN + <= 90 min + scope > 6', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0152-neuron-hq';
    const briefFile = 'observer-c.md';
    const reviewText = `| Scope | 8/10 |\n| **Totalt** | **8.0/10** |\nGODKÄND`;
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics({ timing: { duration_seconds: 5400 } }), // 90 min
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-003.json',
      makeReviewJson(briefFile, reviewText),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).toContain('ACCURATE');
  });

  // Test 4: Scope accuracy edge case
  it('scope accuracy UNDER: GREEN + 95 min + scope 8', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0153-neuron-hq';
    const briefFile = 'observer-d.md';
    const reviewText = `| Scope | 8/10 |\n| **Totalt** | **8.0/10** |\nGODKÄND`;
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics({ timing: { duration_seconds: 5700 } }), // 95 min
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-004.json',
      makeReviewJson(briefFile, reviewText),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).toContain('UNDER');
  });

  // Test 5: Scope accuracy UNDER: RED regardless of scores
  it('scope accuracy UNDER: RED stoplight regardless of score/duration', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0154-neuron-hq';
    const briefFile = 'observer-e.md';
    const reviewText = `| Scope | 9/10 |\n| **Totalt** | **9.0/10** |\nUNDERKÄND`;
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics({ timing: { duration_seconds: 1800 } }), // 30 min
      makeReviewerResult('RED'),
    );
    await setupReviewFile(
      baseDir,
      'review-005.json',
      makeReviewJson(briefFile, reviewText),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).toContain('UNDER');
  });

  // Test 6: Verdict accuracy MATCH: GODKÄND + GREEN
  it('verdict accuracy MATCH: GODKÄND + GREEN', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0155-neuron-hq';
    const briefFile = 'observer-f.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-006.json',
      makeReviewJson(briefFile, REVIEW_TEXT_GODKÄND),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).toContain('MATCH');
  });

  // Test 7: Verdict accuracy MISMATCH: GODKÄND + RED
  it('verdict accuracy MISMATCH: GODKÄND + RED', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0156-neuron-hq';
    const briefFile = 'observer-g.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      makeReviewerResult('RED'),
    );
    await setupReviewFile(
      baseDir,
      'review-007.json',
      makeReviewJson(briefFile, REVIEW_TEXT_GODKÄND),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).toContain('MISMATCH');
  });

  // Test 8: Verdict accuracy MATCH for UNDERKÄND: UNDERKÄND + RED
  it('verdict accuracy MATCH: UNDERKÄND + RED', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0157-neuron-hq';
    const briefFile = 'observer-h.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      makeReviewerResult('RED'),
    );
    await setupReviewFile(
      baseDir,
      'review-008.json',
      makeReviewJson(briefFile, REVIEW_TEXT_UNDERKÄND),
    );

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).toContain('MATCH');
  });

  // Test 9: Missing review → no output, no crash
  it('missing review → no output, no crash', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0158-neuron-hq';
    const briefFile = 'nonexistent.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      makeReviewerResult('GREEN'),
    );
    // Create an unrelated review that won't match
    await setupReviewFile(
      baseDir,
      'review-unrelated.json',
      makeReviewJson('other-brief.md', REVIEW_TEXT_GODKÄND),
    );

    await expect(
      appendCalibration(runDir, baseDir, briefFile),
    ).resolves.toBeUndefined();
    const content = await readCalibration(baseDir);
    expect(content).toBeNull(); // nothing written
  });

  // Test 10: Missing metrics.json → no output, no crash, log message
  it('missing metrics.json → no output, no crash', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0159-neuron-hq';
    const briefFile = 'observer-i.md';
    // Only write reviewer_result, NOT metrics
    const runDir = await setupRunDir(
      baseDir,
      runid,
      undefined, // no metrics
      makeReviewerResult('GREEN'),
    );

    await expect(
      appendCalibration(runDir, baseDir, briefFile),
    ).resolves.toBeUndefined();
    const content = await readCalibration(baseDir);
    expect(content).toBeNull();
  });

  // Test 11: Missing reviewer_result.json → no output, no crash, log message
  it('missing reviewer_result.json → no output, no crash', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0160-neuron-hq';
    const briefFile = 'observer-j.md';
    // Only write metrics, NOT reviewer_result
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      undefined, // no reviewer_result
    );

    await expect(
      appendCalibration(runDir, baseDir, briefFile),
    ).resolves.toBeUndefined();
    const content = await readCalibration(baseDir);
    expect(content).toBeNull();
  });

  // Test 12: Append to existing file (don't overwrite)
  it('appends to existing file without overwriting', async () => {
    const baseDir = tmpDir;
    const runid1 = '20260322-0161-neuron-hq';
    const runid2 = '20260322-0162-neuron-hq';
    const briefFile = 'observer-k.md';

    // First run
    const runDir1 = await setupRunDir(
      baseDir,
      runid1,
      makeMetrics(),
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-011a.json',
      makeReviewJson(briefFile, REVIEW_TEXT_GODKÄND),
    );
    await appendCalibration(runDir1, baseDir, briefFile);

    // Second run with different brief to match same review
    const briefFile2 = 'observer-l.md';
    const runDir2 = await setupRunDir(
      baseDir,
      runid2,
      makeMetrics(),
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-011b.json',
      makeReviewJson(briefFile2, REVIEW_TEXT_GODKÄND),
    );
    await appendCalibration(runDir2, baseDir, briefFile2);

    const content = await readCalibration(baseDir);
    expect(content).not.toBeNull();
    expect(content).toContain(runid1);
    expect(content).toContain(runid2);
    // Header should appear only once
    const headerCount = (content!.match(/# Brief Reviewer/g) ?? []).length;
    expect(headerCount).toBe(1);
  });

  // Test 13: Duplicate protection: same runid not appended twice
  it('duplicate protection: same runid not appended twice', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0163-neuron-hq';
    const briefFile = 'observer-m.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      makeReviewerResult('GREEN'),
    );
    await setupReviewFile(
      baseDir,
      'review-013.json',
      makeReviewJson(briefFile, REVIEW_TEXT_GODKÄND),
    );

    // Call twice
    await appendCalibration(runDir, baseDir, briefFile);
    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    const rowCount = (content!.match(new RegExp(runid, 'g')) ?? []).length;
    expect(rowCount).toBe(1); // only one occurrence
  });

  // Test 14: briefFile fallback: empty briefFile in review JSON → match via turns[0].content
  it('briefFile fallback: matches via turns[0].content when briefFile field is empty', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0164-neuron-hq';
    const briefFile = 'observer-n.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      makeReviewerResult('GREEN'),
    );

    // Review has no briefFile field, but turns[0].content mentions 'observer-n'
    const reviewWithNoField = {
      // no briefFile field
      turns: [
        { role: 'user', content: 'Reviewing observer-n brief now.' },
        { role: 'assistant', content: REVIEW_TEXT_GODKÄND },
      ],
    };
    await setupReviewFile(baseDir, 'review-014.json', reviewWithNoField);

    await appendCalibration(runDir, baseDir, briefFile);

    const content = await readCalibration(baseDir);
    expect(content).not.toBeNull();
    expect(content).toContain(runid);
  });

  // Test 15: Empty turns array in review → skip, no crash
  it('empty turns array in review → skips file without crash', async () => {
    const baseDir = tmpDir;
    const runid = '20260322-0165-neuron-hq';
    const briefFile = 'observer-o.md';
    const runDir = await setupRunDir(
      baseDir,
      runid,
      makeMetrics(),
      makeReviewerResult('GREEN'),
    );

    // Review with empty turns — should be skipped in step 4b
    const emptyTurnsReview = {
      briefFile: '',
      turns: [],
    };
    await setupReviewFile(baseDir, 'review-015a.json', emptyTurnsReview);

    // Also add a valid matching review so the test doesn't fail for wrong reason
    const validReview = makeReviewJson(briefFile, REVIEW_TEXT_GODKÄND);
    await setupReviewFile(baseDir, 'review-015b.json', validReview);

    // Should not crash even with the empty-turns file present
    await expect(
      appendCalibration(runDir, baseDir, briefFile),
    ).resolves.toBeUndefined();
    const content = await readCalibration(baseDir);
    expect(content).toContain(runid);
  });

  // Test 16: Parse review scores from markdown table with various formats
  it('parse review scores: fallback Scope & genomförbarhet pattern', () => {
    const text = `
| Scope & genomförbarhet | 7/10 |
| **Totalt** | **9.0/10** |
GODKÄND
`;
    const result = parseReviewScores(text);
    // Primary regex matches "Scope" prefix, so this works with the primary regex
    expect(result).not.toBeNull();
    expect(result!.scopeScore).toBe(7);
    expect(result!.totalScore).toBe(9.0);
    expect(result!.verdict).toBe('GODKÄND');
  });
});
