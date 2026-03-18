import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const TaskScoreSchema = z.object({
  task_id: z.string(),
  description: z.string(),
  run_id: z.string(),
  iterations_used: z.number(),
  tokens_input: z.number(),
  tokens_output: z.number(),
  commands_run: z.number(),
  commands_blocked: z.number(),
  diff_insertions: z.number(),
  diff_deletions: z.number(),
  re_delegations: z.number(),
  scores: z.object({
    efficiency: z.number().min(0).max(1),
    safety: z.number().min(0).max(1),
    first_pass: z.number().min(0).max(1),
  }),
  aggregate: z.number().min(0).max(1),
  verdict: z.enum(['PASS', 'FAIL', 'PARTIAL']).optional(),
});

export type TaskScore = z.infer<typeof TaskScoreSchema>;

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/**
 * Compute a TaskScore from raw task metrics.
 *
 * Formulas:
 * - efficiency = max(0.1, 1 - (iterations_used - 1) * 0.15)
 * - safety = max(0, 1 - commands_blocked * 0.2)
 * - first_pass = re_delegations === 0 ? 1.0 : 0.5
 * - aggregate = efficiency * 0.5 + safety * 0.3 + first_pass * 0.2
 */
export function computeTaskScore(params: {
  task_id: string;
  description: string;
  run_id: string;
  iterations_used: number;
  tokens_input: number;
  tokens_output: number;
  commands_run: number;
  commands_blocked: number;
  diff_insertions: number;
  diff_deletions: number;
  re_delegations: number;
  verdict?: 'PASS' | 'FAIL' | 'PARTIAL';
}): TaskScore {
  const efficiency = Math.max(0.1, 1 - (params.iterations_used - 1) * 0.15);
  const safety = Math.max(0, 1 - params.commands_blocked * 0.2);
  const firstPass = params.re_delegations === 0 ? 1.0 : 0.5;
  const aggregate = efficiency * 0.5 + safety * 0.3 + firstPass * 0.2;

  return {
    task_id: params.task_id,
    description: params.description,
    run_id: params.run_id,
    iterations_used: params.iterations_used,
    tokens_input: params.tokens_input,
    tokens_output: params.tokens_output,
    commands_run: params.commands_run,
    commands_blocked: params.commands_blocked,
    diff_insertions: params.diff_insertions,
    diff_deletions: params.diff_deletions,
    re_delegations: params.re_delegations,
    scores: {
      efficiency,
      safety,
      first_pass: firstPass,
    },
    aggregate,
    verdict: params.verdict,
  };
}

// ---------------------------------------------------------------------------
// Metric extraction from audit entries
// ---------------------------------------------------------------------------

interface TaskMetrics {
  task_id: string;
  description: string;
  iterations_used: number;
  tokens_input: number;
  tokens_output: number;
  commands_run: number;
  commands_blocked: number;
  diff_insertions: number;
  diff_deletions: number;
  re_delegations: number;
}

/**
 * Extract per-task metrics from audit log entries.
 *
 * Groups entries by task_id (from field or note), then computes
 * iteration counts, token sums, command counts, diff stats, and
 * re-delegation counts for each task in the plan.
 */
export function extractTaskMetrics(
  auditEntries: Array<Record<string, unknown>>,
  taskPlan: Array<{ id: string; description: string }>,
): TaskMetrics[] {
  // Build a map of task_id -> entries
  const taskEntries = new Map<string, Array<Record<string, unknown>>>();
  for (const task of taskPlan) {
    taskEntries.set(task.id, []);
  }

  for (const entry of auditEntries) {
    let matched = false;

    // Direct task_id field
    if (typeof entry.task_id === 'string' && taskEntries.has(entry.task_id)) {
      taskEntries.get(entry.task_id)!.push(entry);
      matched = true;
    }

    // Fallback: search note field for task IDs
    if (!matched && typeof entry.note === 'string') {
      for (const task of taskPlan) {
        if (entry.note.includes(task.id)) {
          taskEntries.get(task.id)!.push(entry);
          matched = true;
          break;
        }
      }
    }
  }

  return taskPlan.map((task) => {
    const entries = taskEntries.get(task.id) ?? [];
    return computeMetricsForEntries(task.id, task.description, entries);
  });
}

/** Compute metrics for a single task's audit entries. */
function computeMetricsForEntries(
  taskId: string,
  description: string,
  entries: Array<Record<string, unknown>>,
): TaskMetrics {
  let iterationsUsed = 0;
  let tokensInput = 0;
  let tokensOutput = 0;
  let commandsRun = 0;
  let commandsBlocked = 0;
  let diffInsertions = 0;
  let diffDeletions = 0;
  let delegationCount = 0;

  // Count unique iterations: entries with role 'implementer' or tool 'delegate_to_implementer'
  const iterationEntries = entries.filter(
    (e) => e.role === 'implementer' || e.tool === 'delegate_to_implementer',
  );
  // Use a set of timestamps to approximate unique iterations
  const iterationKeys = new Set<string>();
  for (const e of iterationEntries) {
    iterationKeys.add(String(e.ts ?? '') + '|' + String(e.tool ?? ''));
  }
  iterationsUsed = iterationKeys.size;

  for (const entry of entries) {
    // Token sums
    if (typeof entry.tokens_input === 'number') {
      tokensInput += entry.tokens_input;
    }
    if (typeof entry.tokens_output === 'number') {
      tokensOutput += entry.tokens_output;
    }

    // Command counts
    if (entry.tool === 'bash_exec' && entry.allowed === true) {
      commandsRun++;
    }
    if (entry.allowed === false) {
      commandsBlocked++;
    }

    // Diff stats
    const diffStats = entry.diff_stats as
      | { additions?: number; deletions?: number }
      | undefined;
    if (diffStats) {
      diffInsertions += diffStats.additions ?? 0;
      diffDeletions += diffStats.deletions ?? 0;
    }

    // Delegation counting
    if (entry.tool === 'delegate_to_implementer') {
      delegationCount++;
    }
  }

  // Re-delegations = extra calls beyond the first
  const reDelegations = Math.max(0, delegationCount - 1);

  return {
    task_id: taskId,
    description,
    iterations_used: iterationsUsed,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    commands_run: commandsRun,
    commands_blocked: commandsBlocked,
    diff_insertions: diffInsertions,
    diff_deletions: diffDeletions,
    re_delegations: reDelegations,
  };
}

// ---------------------------------------------------------------------------
// Similarity search
// ---------------------------------------------------------------------------

/** Tokenize a string into a set of lowercase words. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter((w) => w.length > 0),
  );
}

/** Compute Jaccard similarity between two strings. */
function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of setA) {
    if (setB.has(word)) intersectionSize++;
  }

  const unionSize = new Set([...setA, ...setB]).size;
  return intersectionSize / unionSize;
}

/**
 * Find historical task scores with similar descriptions.
 *
 * Uses Jaccard similarity on word sets; returns scores above
 * the threshold, sorted by similarity descending.
 */
export function findSimilarTaskScores(
  historicalScores: TaskScore[],
  description: string,
  threshold: number = 0.4,
): TaskScore[] {
  const scored = historicalScores
    .map((s) => ({
      score: s,
      similarity: jaccardSimilarity(description, s.description),
    }))
    .filter((x) => x.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  return scored.map((x) => x.score);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {  /* intentional: safe fallback for missing/malformed file */
    return null;
  }
}

async function readJsonlSafe(filePath: string): Promise<Array<Record<string, unknown>>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {  /* intentional: safe fallback for missing/malformed file */
    return [];
  }
}

async function readTextSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {  /* intentional: safe fallback for missing/malformed file */
    return '';
  }
}

// ---------------------------------------------------------------------------
// Task plan parsing
// ---------------------------------------------------------------------------

/**
 * Parse task_plan.md to extract task IDs and descriptions.
 *
 * Supports formats:
 * - `- T1: Create some thing`
 * - `| T1 | Create some thing |`
 * - `## T1: Create some thing`
 * - Any line with `T\d+:` or `T\d+ |`
 */
function parseTaskPlan(text: string): Array<{ id: string; description: string }> {
  const tasks: Array<{ id: string; description: string }> = [];
  const seen = new Set<string>();

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    // Pattern: - T1: description  or  ## T1: description
    const colonMatch = trimmed.match(/(?:^[-*#]*\s*)(T\d+)\s*:\s*(.+)/);
    if (colonMatch) {
      const id = colonMatch[1];
      const desc = colonMatch[2].trim();
      if (!seen.has(id)) {
        tasks.push({ id, description: desc });
        seen.add(id);
      }
      continue;
    }

    // Pattern: | T1 | description |
    const tableMatch = trimmed.match(/\|\s*(T\d+)\s*\|\s*(.+?)\s*\|/);
    if (tableMatch) {
      const id = tableMatch[1];
      const desc = tableMatch[2].trim();
      if (!seen.has(id)) {
        tasks.push({ id, description: desc });
        seen.add(id);
      }
    }
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Main: compute all task scores for a run
// ---------------------------------------------------------------------------

/**
 * Compute task scores for every task in a run directory.
 *
 * Reads task_plan.md, audit.jsonl, usage.json, and manifest.json,
 * then writes task_scores.jsonl back to runDir.
 */
export async function computeAllTaskScores(runDir: string): Promise<TaskScore[]> {
  const taskPlanText = await readTextSafe(path.join(runDir, 'task_plan.md'));
  const taskPlan = parseTaskPlan(taskPlanText);

  const auditEntries = await readJsonlSafe(path.join(runDir, 'audit.jsonl'));
  const usage = await readJsonSafe<Record<string, unknown>>(
    path.join(runDir, 'usage.json'),
  );
  const manifest = await readJsonSafe<Record<string, unknown>>(
    path.join(runDir, 'manifest.json'),
  );

  const runId =
    (manifest?.runid as string) ??
    (usage?.runid as string) ??
    path.basename(runDir);

  const metrics = extractTaskMetrics(auditEntries, taskPlan);

  // Merge global token counts from usage.json if per-entry tokens are missing
  // (best-effort: divide evenly across tasks that have zero tokens)
  const totalInput = (usage?.total_input_tokens as number) ?? 0;
  const totalOutput = (usage?.total_output_tokens as number) ?? 0;
  const metricsWithoutTokens = metrics.filter(
    (m) => m.tokens_input === 0 && m.tokens_output === 0,
  );
  if (metricsWithoutTokens.length > 0 && (totalInput > 0 || totalOutput > 0)) {
    const share = metricsWithoutTokens.length;
    for (const m of metricsWithoutTokens) {
      m.tokens_input = Math.round(totalInput / share);
      m.tokens_output = Math.round(totalOutput / share);
    }
  }

  const scores = metrics.map((m) =>
    computeTaskScore({
      ...m,
      run_id: runId,
    }),
  );

  // Write task_scores.jsonl
  const lines = scores.map((s) => JSON.stringify(s)).join('\n') + '\n';
  await fs.writeFile(path.join(runDir, 'task_scores.jsonl'), lines, 'utf-8');

  return scores;
}
