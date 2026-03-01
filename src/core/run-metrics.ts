import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const RunMetricsSchema = z.object({
  runid: z.string(),
  computed_at: z.string().datetime(),
  timing: z.object({
    started_at: z.string().datetime(),
    completed_at: z.string().datetime().optional(),
    duration_seconds: z.number().optional(),
  }),
  testing: z.object({
    baseline_passed: z.number(),
    baseline_failed: z.number(),
    after_passed: z.number(),
    after_failed: z.number(),
    tests_added: z.number(),
  }),
  tokens: z.object({
    total_input: z.number(),
    total_output: z.number(),
    by_agent: z.record(
      z.object({
        input: z.number(),
        output: z.number(),
        iterations: z.number(),
        tokens_per_iteration: z.number(),
      }),
    ),
  }),
  code: z.object({
    files_new: z.number(),
    files_modified: z.number(),
    insertions: z.number(),
    deletions: z.number(),
  }),
  delegations: z.object({
    total: z.number(),
    by_target: z.record(z.number()),
    re_delegations: z.number(),
  }),
  policy: z.object({
    commands_run: z.number(),
    commands_blocked: z.number(),
  }),
});

export type RunMetrics = z.infer<typeof RunMetricsSchema>;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Extract test counts from text (baseline.md / report.md).
 * Picks the LAST occurrence of each pattern (vitest output often at end).
 */
export function parseTestCounts(text: string): {
  passed: number;
  failed: number;
} {
  let passed = 0;
  let failed = 0;

  const passedMatches = [...text.matchAll(/(\d+)\s+passed/g)];
  if (passedMatches.length > 0) {
    passed = Number(passedMatches[passedMatches.length - 1][1]);
  }

  const failedMatches = [...text.matchAll(/(\d+)\s+failed/g)];
  if (failedMatches.length > 0) {
    failed = Number(failedMatches[failedMatches.length - 1][1]);
  }

  const preExistingMatches = [
    ...text.matchAll(/(\d+)\s+pre-existing fail/g),
  ];
  if (preExistingMatches.length > 0) {
    failed += Number(
      preExistingMatches[preExistingMatches.length - 1][1],
    );
  }

  return { passed, failed };
}

/**
 * Count delegations from audit entries.
 */
export function countDelegations(
  auditEntries: Array<{ tool: string; role: string }>,
): {
  total: number;
  by_target: Record<string, number>;
  re_delegations: number;
} {
  const byTarget: Record<string, number> = {};
  let total = 0;

  for (const entry of auditEntries) {
    if (entry.tool.startsWith('delegate_to_')) {
      const target = entry.tool.slice('delegate_to_'.length);
      byTarget[target] = (byTarget[target] ?? 0) + 1;
      total++;
    }
  }

  let reDelegations = 0;
  for (const count of Object.values(byTarget)) {
    if (count > 1) {
      reDelegations += count - 1;
    }
  }

  return { total, by_target: byTarget, re_delegations: reDelegations };
}

/**
 * Aggregate diff stats from audit entries.
 */
export function aggregateDiffStats(
  auditEntries: Array<{
    diff_stats?: { additions?: number; deletions?: number };
    files_touched?: string[];
  }>,
): {
  insertions: number;
  deletions: number;
  files_new: number;
  files_modified: number;
} {
  let insertions = 0;
  let deletions = 0;
  const allFiles = new Set<string>();

  for (const entry of auditEntries) {
    if (entry.diff_stats) {
      insertions += entry.diff_stats.additions ?? 0;
      deletions += entry.diff_stats.deletions ?? 0;
    }
    if (entry.files_touched) {
      for (const f of entry.files_touched) {
        allFiles.add(f);
      }
    }
  }

  return {
    insertions,
    deletions,
    files_new: 0,
    files_modified: allFiles.size,
  };
}

// ---------------------------------------------------------------------------
// File reading helpers (swallow missing-file errors)
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
// Main computation
// ---------------------------------------------------------------------------

interface UsageJson {
  runid: string;
  total_input_tokens: number;
  total_output_tokens: number;
  by_agent: Record<
    string,
    {
      input_tokens: number;
      output_tokens: number;
      iterations_used?: number;
      iterations_limit?: number;
    }
  >;
}

interface ManifestJson {
  runid: string;
  started_at: string;
  completed_at?: string;
}

interface AuditLine {
  ts: string;
  role: string;
  tool: string;
  allowed: boolean;
  diff_stats?: { additions?: number; deletions?: number };
  files_touched?: string[];
  policy_event?: string;
}

/**
 * Compute run metrics from files stored in `runDir`.
 *
 * Throws if `runDir` does not exist. Individual missing files default to 0s.
 */
export async function computeRunMetrics(
  runDir: string,
): Promise<RunMetrics> {
  // Verify directory exists
  try {
    await fs.access(runDir);
  } catch {
    throw new Error(`Run directory does not exist: ${runDir}`);
  }

  // Read source files
  const usage = await readJsonSafe<UsageJson>(
    path.join(runDir, 'usage.json'),
  );
  const manifest = await readJsonSafe<ManifestJson>(
    path.join(runDir, 'manifest.json'),
  );
  const auditEntries = await readJsonlSafe<AuditLine>(
    path.join(runDir, 'audit.jsonl'),
  );
  const baselineText = await readTextSafe(
    path.join(runDir, 'baseline.md'),
  );
  const reportText = await readTextSafe(
    path.join(runDir, 'report.md'),
  );

  // Derive runid
  const runid =
    manifest?.runid ?? usage?.runid ?? path.basename(runDir);

  // Timing
  const startedAt =
    manifest?.started_at ?? new Date(0).toISOString();
  const completedAt = manifest?.completed_at;
  let durationSeconds: number | undefined;
  if (startedAt && completedAt) {
    durationSeconds =
      (new Date(completedAt).getTime() -
        new Date(startedAt).getTime()) /
      1000;
  }

  // Testing
  const baseline = parseTestCounts(baselineText);
  const after = parseTestCounts(reportText);
  const testsAdded = Math.max(0, after.passed - baseline.passed);

  // Tokens
  const totalInput = usage?.total_input_tokens ?? 0;
  const totalOutput = usage?.total_output_tokens ?? 0;
  const byAgent: Record<
    string,
    {
      input: number;
      output: number;
      iterations: number;
      tokens_per_iteration: number;
    }
  > = {};

  if (usage?.by_agent) {
    for (const [agent, data] of Object.entries(usage.by_agent)) {
      const iterations = data.iterations_used ?? 0;
      const totalTokens = data.input_tokens + data.output_tokens;
      byAgent[agent] = {
        input: data.input_tokens,
        output: data.output_tokens,
        iterations,
        tokens_per_iteration:
          iterations > 0 ? totalTokens / iterations : 0,
      };
    }
  }

  // Code
  const code = aggregateDiffStats(auditEntries);

  // Delegations
  const delegations = countDelegations(auditEntries);

  // Policy
  let commandsRun = 0;
  let commandsBlocked = 0;
  for (const entry of auditEntries) {
    if (entry.tool === 'bash_exec' && entry.allowed) {
      commandsRun++;
    }
    if (!entry.allowed) {
      commandsBlocked++;
    }
  }

  return {
    runid,
    computed_at: new Date().toISOString(),
    timing: {
      started_at: startedAt,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
    },
    testing: {
      baseline_passed: baseline.passed,
      baseline_failed: baseline.failed,
      after_passed: after.passed,
      after_failed: after.failed,
      tests_added: testsAdded,
    },
    tokens: {
      total_input: totalInput,
      total_output: totalOutput,
      by_agent: byAgent,
    },
    code,
    delegations,
    policy: {
      commands_run: commandsRun,
      commands_blocked: commandsBlocked,
    },
  };
}
