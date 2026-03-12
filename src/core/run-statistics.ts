import fs from 'fs/promises';
import path from 'path';
import { bayesianUpdate } from '../aurora/bayesian-confidence.js';
import { getPool, isDbAvailable } from './db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BriefType =
  | 'feature'
  | 'refactor'
  | 'bugfix'
  | 'test'
  | 'docs'
  | 'infrastructure';

export interface RunOutcome {
  dimension: string;
  success: boolean;
  weight: number;
  evidence: string;
}

export interface RunBelief {
  dimension: string;
  confidence: number;
  total_runs: number;
  successes: number;
  last_updated: string;
}

export interface RunBeliefAudit {
  id: number;
  dimension: string;
  runid: string;
  old_confidence: number;
  new_confidence: number;
  success: boolean;
  weight: number;
  evidence: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// File I/O helpers (swallow missing-file errors)
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readTextSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function readJsonlSafe<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Brief classification
// ---------------------------------------------------------------------------

const BRIEF_PATTERNS: Array<[RegExp, BriefType]> = [
  [/\bfeature\b|\badd\b|\bimplement(?!er)\w*\b|\bnew\b|\blaunch\b|\benable\b/, 'feature'],
  [/\brefactor|\bclean\b|\brestructure|\bmodernize|\bconsolidat/, 'refactor'],
  [/\bfix\b|\bbug|\bbroken\b|\bissue\b|\bcrash|\bregression/, 'bugfix'],
  [/\btest|\bspec\b|\bcoverage\b|\bvalidat/, 'test'],
  [/\bdoc\b|\breadme\b|\bguide\b|\bhandbook\b|\bcomment\b/, 'docs'],
];

/**
 * Classify a brief file into a BriefType based on title and first few lines.
 * Strips common prefixes like "# Brief:" before matching.
 */
export async function classifyBrief(briefPath: string): Promise<BriefType> {
  const text = await readTextSafe(briefPath);
  const lines = text.split('\n').slice(0, 5);

  // Build search text from first 5 lines, stripping markdown/brief prefixes
  const searchText = lines
    .map((l) => l.replace(/^#+\s*/, '').replace(/^brief\s*[:—–-]\s*/i, ''))
    .join(' ')
    .toLowerCase();

  for (const [pattern, briefType] of BRIEF_PATTERNS) {
    if (pattern.test(searchText)) {
      return briefType;
    }
  }
  return 'infrastructure';
}

// ---------------------------------------------------------------------------
// Outcome collection
// ---------------------------------------------------------------------------

interface MetricsJson {
  runid?: string;
  testing: { tests_added: number };
  delegations: { re_delegations: number };
  policy: { commands_blocked: number };
  tokens: {
    total_input: number;
    total_output: number;
    by_agent: Record<string, unknown>;
  };
}

interface UsageJson {
  model?: string;
}

interface ManifestJson {
  target_name?: string;
}

interface TaskScoreLine {
  aggregate: number;
}

/**
 * Collect run outcomes from files in a run directory.
 * Each signal generates one RunOutcome per applicable dimension.
 */
export async function collectOutcomes(runDir: string): Promise<RunOutcome[]> {
  const metrics = await readJsonSafe<MetricsJson>(
    path.join(runDir, 'metrics.json'),
  );
  const reportText = await readTextSafe(path.join(runDir, 'report.md'));
  const usage = await readJsonSafe<UsageJson>(
    path.join(runDir, 'usage.json'),
  );
  const manifest = await readJsonSafe<ManifestJson>(
    path.join(runDir, 'manifest.json'),
  );
  const taskScores = await readJsonlSafe<TaskScoreLine>(
    path.join(runDir, 'task_scores.jsonl'),
  );

  // Build dimensions
  const dimensions: string[] = [];

  if (metrics?.tokens?.by_agent) {
    for (const role of Object.keys(metrics.tokens.by_agent)) {
      dimensions.push(`agent:${role}`);
    }
  }

  const briefType = await classifyBrief(path.join(runDir, 'brief.md'));
  dimensions.push(`brief:${briefType}`);

  if (manifest?.target_name) {
    dimensions.push(`target:${manifest.target_name}`);
  }

  if (usage?.model) {
    dimensions.push(`model:${usage.model}`);
  }

  // Build signals
  interface Signal {
    name: string;
    success: boolean;
    weight: number;
    evidence: string;
    skip?: boolean;
  }

  const signals: Signal[] = [];

  // 1. Stoplight — match multiple report formats
  if (reportText) {
    const greenPatterns = [
      /STOPLIGHT:\s*GREEN/i,
      /STOPLIGHT\s+GREEN/i,
      /Verdict:\s*GREEN/i,
      /\bAPPROVED\b/i,
      /✅\s*(?:After[- ]change\s+verify|Baseline\s+verify):\s*PASS/i,
    ];
    const failPatterns = [
      /STOPLIGHT:\s*(?:YELLOW|RED)/i,
      /STOPLIGHT\s+(?:YELLOW|RED)/i,
      /Verdict:\s*(?:YELLOW|RED)/i,
      /\bREJECTED\b/i,
    ];
    const greenMatch = greenPatterns.some((p) => p.test(reportText));
    const failMatch = failPatterns.some((p) => p.test(reportText));
    if (greenMatch || failMatch) {
      signals.push({
        name: 'stoplight',
        success: greenMatch && !failMatch,
        weight: 0.20,
        evidence: greenMatch && !failMatch
          ? 'Stoplight GREEN in report'
          : 'Stoplight YELLOW/RED in report',
      });
    }
  }

  // 2. No re-delegations
  if (metrics) {
    signals.push({
      name: 're-delegations',
      success: metrics.delegations.re_delegations === 0,
      weight: 0.10,
      evidence:
        metrics.delegations.re_delegations === 0
          ? 'No re-delegations'
          : `${metrics.delegations.re_delegations} re-delegation(s)`,
    });
  }

  // 3. No blocked commands
  if (metrics) {
    signals.push({
      name: 'blocked-commands',
      success: metrics.policy.commands_blocked === 0,
      weight: 0.08,
      evidence:
        metrics.policy.commands_blocked === 0
          ? 'No blocked commands'
          : `${metrics.policy.commands_blocked} command(s) blocked`,
    });
  }

  // 4. Tests added (feature briefs only)
  if (metrics && briefType === 'feature') {
    signals.push({
      name: 'tests-added',
      success: metrics.testing.tests_added > 0,
      weight: 0.06,
      evidence:
        metrics.testing.tests_added > 0
          ? `${metrics.testing.tests_added} test(s) added`
          : 'No tests added for feature brief',
    });
  }

  // 5. Task score good
  if (taskScores.length > 0) {
    const avgScore =
      taskScores.reduce((sum, t) => sum + t.aggregate, 0) / taskScores.length;
    signals.push({
      name: 'task-score',
      success: avgScore >= 0.7,
      weight: 0.12,
      evidence: `Average task score: ${avgScore.toFixed(2)}`,
    });
  }

  // 6. Under token budget
  if (metrics) {
    const totalTokens =
      metrics.tokens.total_input + metrics.tokens.total_output;
    signals.push({
      name: 'token-budget',
      success: totalTokens < 15_000_000,
      weight: 0.05,
      evidence: `Total tokens: ${totalTokens}`,
    });
  }

  // Generate outcomes: each signal × each dimension
  const outcomes: RunOutcome[] = [];
  for (const signal of signals) {
    if (signal.skip) continue;
    for (const dimension of dimensions) {
      outcomes.push({
        dimension,
        success: signal.success,
        weight: signal.weight,
        evidence: signal.evidence,
      });
    }
  }

  return outcomes;
}

// ---------------------------------------------------------------------------
// Belief updates
// ---------------------------------------------------------------------------

/**
 * Update run beliefs in the database for each outcome.
 * No-ops gracefully if the database is unavailable.
 */
export async function updateRunBeliefs(
  outcomes: RunOutcome[],
  runid?: string,
): Promise<void> {
  if (!(await isDbAvailable())) return;

  const pool = getPool();
  const effectiveRunId = runid ?? 'unknown';

  for (const outcome of outcomes) {
    // Get current belief
    const { rows } = await pool.query(
      'SELECT confidence, total_runs, successes FROM run_beliefs WHERE dimension = $1',
      [outcome.dimension],
    );

    let currentConfidence = 0.5;
    let totalRuns = 0;
    let successes = 0;

    if (rows.length > 0) {
      currentConfidence = rows[0].confidence as number;
      totalRuns = rows[0].total_runs as number;
      successes = rows[0].successes as number;
    }

    const oldConfidence = currentConfidence;

    // Apply bayesian update
    const newConfidence = bayesianUpdate(currentConfidence, {
      direction: outcome.success ? 'supports' : 'contradicts',
      sourceType: 'official',
      weight: outcome.weight,
      reason: outcome.evidence,
    });

    totalRuns += 1;
    if (outcome.success) successes += 1;

    // Upsert belief
    await pool.query(
      `INSERT INTO run_beliefs (dimension, confidence, total_runs, successes, last_updated)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (dimension) DO UPDATE
       SET confidence = $2, total_runs = $3, successes = $4, last_updated = NOW()`,
      [outcome.dimension, newConfidence, totalRuns, successes],
    );

    // Insert audit
    await pool.query(
      `INSERT INTO run_belief_audit
         (dimension, runid, old_confidence, new_confidence, success, weight, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        outcome.dimension,
        effectiveRunId,
        oldConfidence,
        newConfidence,
        outcome.success,
        outcome.weight,
        outcome.evidence,
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Get all beliefs, optionally filtered by dimension prefix.
 */
export async function getBeliefs(
  filter?: { prefix?: string },
): Promise<RunBelief[]> {
  if (!(await isDbAvailable())) return [];

  const pool = getPool();

  let query = 'SELECT dimension, confidence, total_runs, successes, last_updated FROM run_beliefs';
  const params: unknown[] = [];

  if (filter?.prefix) {
    query += ' WHERE dimension LIKE $1';
    params.push(`${filter.prefix}%`);
  }

  query += ' ORDER BY confidence DESC';

  const { rows } = await pool.query(query, params);
  return rows.map((r: Record<string, unknown>) => ({
    dimension: r.dimension as string,
    confidence: r.confidence as number,
    total_runs: r.total_runs as number,
    successes: r.successes as number,
    last_updated: String(r.last_updated),
  }));
}

/**
 * Get audit history for a specific dimension.
 */
export async function getBeliefHistory(
  dimension: string,
  limit: number = 20,
): Promise<RunBeliefAudit[]> {
  if (!(await isDbAvailable())) return [];

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, dimension, runid, old_confidence, new_confidence,
            success, weight, evidence, timestamp
     FROM run_belief_audit
     WHERE dimension = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [dimension, limit],
  );

  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    dimension: r.dimension as string,
    runid: r.runid as string,
    old_confidence: r.old_confidence as number,
    new_confidence: r.new_confidence as number,
    success: r.success as boolean,
    weight: r.weight as number,
    evidence: r.evidence as string,
    timestamp: String(r.timestamp),
  }));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

interface RunSummary {
  strongest: RunBelief[];
  weakest: RunBelief[];
  trending_up: RunBelief[];
  trending_down: RunBelief[];
}

/**
 * Get a summary of beliefs: strongest, weakest, trending up/down.
 */
export async function getSummary(): Promise<RunSummary> {
  if (!(await isDbAvailable())) {
    return { strongest: [], weakest: [], trending_up: [], trending_down: [] };
  }

  const pool = getPool();

  // Get all beliefs
  const { rows: beliefRows } = await pool.query(
    'SELECT dimension, confidence, total_runs, successes, last_updated FROM run_beliefs ORDER BY confidence DESC',
  );

  const allBeliefs: RunBelief[] = beliefRows.map((r: Record<string, unknown>) => ({
    dimension: r.dimension as string,
    confidence: r.confidence as number,
    total_runs: r.total_runs as number,
    successes: r.successes as number,
    last_updated: String(r.last_updated),
  }));

  const strongest = allBeliefs.slice(0, 5);
  const weakest = [...allBeliefs].sort((a, b) => a.confidence - b.confidence).slice(0, 5);

  // Trending: for each belief, get last 5 audit entries
  const trendingUp: RunBelief[] = [];
  const trendingDown: RunBelief[] = [];

  for (const belief of allBeliefs) {
    const { rows: auditRows } = await pool.query(
      `SELECT old_confidence, new_confidence
       FROM run_belief_audit
       WHERE dimension = $1
       ORDER BY timestamp DESC
       LIMIT 5`,
      [belief.dimension],
    );

    if (auditRows.length < 2) continue;

    const lastEntry = auditRows[0] as Record<string, unknown>;
    const firstEntry = auditRows[auditRows.length - 1] as Record<string, unknown>;
    const lastNew = lastEntry.new_confidence as number;
    const firstOld = firstEntry.old_confidence as number;

    if (lastNew > firstOld) {
      trendingUp.push(belief);
    } else if (lastNew < firstOld) {
      trendingDown.push(belief);
    }
  }

  return {
    strongest,
    weakest,
    trending_up: trendingUp.slice(0, 5),
    trending_down: trendingDown.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

/**
 * Backfill run beliefs from all run directories.
 * Skips directories ending with '-resume'.
 */
export async function backfillAllRuns(
  runsBaseDir: string,
): Promise<{ processed: number; dimensions: number }> {
  let entries: string[];
  try {
    const dirEntries = await fs.readdir(runsBaseDir, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => e.isDirectory() && !e.name.endsWith('-resume'))
      .map((e) => e.name)
      .sort();
  } catch {
    return { processed: 0, dimensions: 0 };
  }

  let processed = 0;
  for (const entry of entries) {
    const runDir = path.join(runsBaseDir, entry);
    const metricsPath = path.join(runDir, 'metrics.json');

    try {
      await fs.access(metricsPath);
    } catch {
      continue;
    }

    const outcomes = await collectOutcomes(runDir);
    await updateRunBeliefs(outcomes, entry);
    processed++;
  }

  // Count unique dimensions
  let dimensionCount = 0;
  if (await isDbAvailable()) {
    const pool = getPool();
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM run_beliefs');
    dimensionCount = Number((rows[0] as Record<string, unknown>).count);
  }

  return { processed, dimensions: dimensionCount };
}
