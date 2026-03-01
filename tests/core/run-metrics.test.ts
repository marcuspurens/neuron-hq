import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  parseTestCounts,
  countDelegations,
  aggregateDiffStats,
  computeRunMetrics,
  RunMetricsSchema,
} from '../../src/core/run-metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// parseTestCounts
// ---------------------------------------------------------------------------

describe('parseTestCounts', () => {
  it('extracts "522 passed" correctly', () => {
    const text = 'Tests  522 passed (522)';
    expect(parseTestCounts(text)).toEqual({ passed: 522, failed: 0 });
  });

  it('extracts "522 passed, 1 failed" correctly', () => {
    const text = 'Tests  522 passed, 1 failed (523)';
    expect(parseTestCounts(text)).toEqual({ passed: 522, failed: 1 });
  });

  it('returns 0 if no match', () => {
    const text = 'all good, nothing to report';
    expect(parseTestCounts(text)).toEqual({ passed: 0, failed: 0 });
  });

  it('handles "1 pre-existing fail" as failed', () => {
    const text = '5 passed\n1 pre-existing fail';
    expect(parseTestCounts(text)).toEqual({ passed: 5, failed: 1 });
  });

  it('returns zeros for empty string', () => {
    expect(parseTestCounts('')).toEqual({ passed: 0, failed: 0 });
  });

  it('picks the LAST occurrence of passed/failed', () => {
    const text = '3 passed\nsome output\n10 passed\n1 failed\n5 failed';
    expect(parseTestCounts(text)).toEqual({ passed: 10, failed: 5 });
  });

  it('combines failed and pre-existing fail counts', () => {
    const text = '5 passed\n2 failed\n3 pre-existing fail';
    expect(parseTestCounts(text)).toEqual({ passed: 5, failed: 5 });
  });
});

// ---------------------------------------------------------------------------
// countDelegations
// ---------------------------------------------------------------------------

describe('countDelegations', () => {
  it('counts delegate_to_implementer calls', () => {
    const entries = [
      { tool: 'delegate_to_implementer', role: 'manager' },
      { tool: 'bash_exec', role: 'implementer' },
      { tool: 'delegate_to_implementer', role: 'manager' },
    ];
    const result = countDelegations(entries);
    expect(result.total).toBe(2);
    expect(result.by_target['implementer']).toBe(2);
  });

  it('identifies re-delegations (>1 call to same target)', () => {
    const entries = [
      { tool: 'delegate_to_implementer', role: 'manager' },
      { tool: 'delegate_to_implementer', role: 'manager' },
      { tool: 'delegate_to_reviewer', role: 'manager' },
    ];
    const result = countDelegations(entries);
    expect(result.re_delegations).toBe(1);
    expect(result.by_target).toEqual({ implementer: 2, reviewer: 1 });
  });

  it('returns zeros for empty list', () => {
    expect(countDelegations([])).toEqual({
      total: 0,
      by_target: {},
      re_delegations: 0,
    });
  });

  it('ignores non-delegation entries', () => {
    const entries = [
      { tool: 'bash_exec', role: 'implementer' },
      { tool: 'read_file', role: 'implementer' },
    ];
    const result = countDelegations(entries);
    expect(result.total).toBe(0);
    expect(result.re_delegations).toBe(0);
  });

  it('computes re_delegations across multiple targets', () => {
    const entries = [
      { tool: 'delegate_to_implementer', role: 'manager' },
      { tool: 'delegate_to_implementer', role: 'manager' },
      { tool: 'delegate_to_implementer', role: 'manager' },
      { tool: 'delegate_to_reviewer', role: 'manager' },
      { tool: 'delegate_to_reviewer', role: 'manager' },
    ];
    const result = countDelegations(entries);
    // implementer: 3 => 2 re-delegations, reviewer: 2 => 1
    expect(result.re_delegations).toBe(3);
    expect(result.total).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// aggregateDiffStats
// ---------------------------------------------------------------------------

describe('aggregateDiffStats', () => {
  it('sums insertions and deletions', () => {
    const entries = [
      { diff_stats: { additions: 10, deletions: 3 } },
      { diff_stats: { additions: 5, deletions: 2 } },
    ];
    const result = aggregateDiffStats(entries);
    expect(result.insertions).toBe(15);
    expect(result.deletions).toBe(5);
  });

  it('counts unique files (new vs modified)', () => {
    const entries = [
      { files_touched: ['a.ts', 'b.ts'] },
      { files_touched: ['b.ts', 'c.ts'] },
    ];
    const result = aggregateDiffStats(entries);
    expect(result.files_modified).toBe(3);
    expect(result.files_new).toBe(0);
  });

  it('handles entries without diff_stats', () => {
    const entries = [
      { files_touched: ['a.ts'] },
      { diff_stats: { additions: 1 } },
    ];
    const result = aggregateDiffStats(entries);
    expect(result.insertions).toBe(1);
    expect(result.deletions).toBe(0);
    expect(result.files_modified).toBe(1);
  });

  it('returns zeros for empty array', () => {
    expect(aggregateDiffStats([])).toEqual({
      insertions: 0,
      deletions: 0,
      files_new: 0,
      files_modified: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// RunMetricsSchema
// ---------------------------------------------------------------------------

describe('RunMetricsSchema', () => {
  it('validates a correct metrics object', () => {
    const metrics = {
      runid: '20260301-0000-test',
      computed_at: '2026-03-01T00:00:00.000Z',
      timing: {
        started_at: '2026-03-01T00:00:00.000Z',
        completed_at: '2026-03-01T01:00:00.000Z',
        duration_seconds: 3600,
      },
      testing: {
        baseline_passed: 500,
        baseline_failed: 0,
        after_passed: 515,
        after_failed: 0,
        tests_added: 15,
      },
      tokens: {
        total_input: 100000,
        total_output: 5000,
        by_agent: {
          manager: { input: 50000, output: 2000, iterations: 10, tokens_per_iteration: 5200 },
          implementer: { input: 50000, output: 3000, iterations: 20, tokens_per_iteration: 2650 },
        },
      },
      code: { files_new: 0, files_modified: 1, insertions: 50, deletions: 10 },
      delegations: { total: 2, by_target: { implementer: 1, reviewer: 1 }, re_delegations: 0 },
      policy: { commands_run: 30, commands_blocked: 1 },
    };
    const parsed = RunMetricsSchema.safeParse(metrics);
    expect(parsed.success).toBe(true);
  });

  it('rejects if required fields are missing', () => {
    const incomplete = {
      runid: '20260301-0000-test',
      // missing computed_at, timing, testing, tokens, code, delegations, policy
    };
    const parsed = RunMetricsSchema.safeParse(incomplete);
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeRunMetrics (integration)
// ---------------------------------------------------------------------------

describe('computeRunMetrics', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-metrics-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('throws if runDir does not exist', async () => {
    await expect(
      computeRunMetrics('/nonexistent/path'),
    ).rejects.toThrow('Run directory does not exist');
  });

  it('generates complete metrics object from testdata', async () => {
    // Write mock usage.json
    const usage = {
      runid: '20260301-0000-test',
      model: 'claude-sonnet-4-5-20250929',
      total_input_tokens: 100000,
      total_output_tokens: 5000,
      by_agent: {
        manager: { input_tokens: 50000, output_tokens: 2000, iterations_used: 10, iterations_limit: 50 },
        implementer: { input_tokens: 50000, output_tokens: 3000, iterations_used: 20, iterations_limit: 50 },
      },
      tool_counts: { bash_exec: 30, read_file: 10 },
    };
    await fs.writeFile(path.join(tempDir, 'usage.json'), JSON.stringify(usage));

    // Write mock audit.jsonl
    const auditLines = [
      JSON.stringify({ ts: '2026-03-01T00:00:00.000Z', role: 'manager', tool: 'delegate_to_implementer', allowed: true }),
      JSON.stringify({ ts: '2026-03-01T00:01:00.000Z', role: 'manager', tool: 'bash_exec', allowed: true, diff_stats: { additions: 50, deletions: 10 }, files_touched: ['src/foo.ts'] }),
      JSON.stringify({ ts: '2026-03-01T00:02:00.000Z', role: 'manager', tool: 'bash_exec', allowed: false, policy_event: 'BLOCKED' }),
      JSON.stringify({ ts: '2026-03-01T00:03:00.000Z', role: 'manager', tool: 'delegate_to_reviewer', allowed: true }),
    ];
    await fs.writeFile(path.join(tempDir, 'audit.jsonl'), auditLines.join('\n') + '\n');

    // Write mock manifest.json
    const manifest = {
      runid: '20260301-0000-test',
      target_name: 'test-target',
      target_start_sha: 'abc123',
      workspace_branch: 'neuron/test',
      started_at: '2026-03-01T00:00:00.000Z',
      completed_at: '2026-03-01T01:00:00.000Z',
      commands: [],
      checksums: {},
    };
    await fs.writeFile(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest));

    // Write mock baseline.md
    await fs.writeFile(path.join(tempDir, 'baseline.md'), 'Tests  500 passed (500)\n');

    // Write mock report.md
    await fs.writeFile(path.join(tempDir, 'report.md'), 'Tests  515 passed (515)\n');

    const metrics = await computeRunMetrics(tempDir);

    // Validate the complete result
    expect(metrics.runid).toBe('20260301-0000-test');
    expect(metrics.timing.started_at).toBe('2026-03-01T00:00:00.000Z');
    expect(metrics.timing.completed_at).toBe('2026-03-01T01:00:00.000Z');
    expect(metrics.timing.duration_seconds).toBe(3600);
    expect(metrics.testing.baseline_passed).toBe(500);
    expect(metrics.testing.baseline_failed).toBe(0);
    expect(metrics.testing.after_passed).toBe(515);
    expect(metrics.testing.after_failed).toBe(0);
    expect(metrics.testing.tests_added).toBe(15);
    expect(metrics.tokens.total_input).toBe(100000);
    expect(metrics.tokens.total_output).toBe(5000);
    expect(metrics.tokens.by_agent['manager'].input).toBe(50000);
    expect(metrics.tokens.by_agent['implementer'].output).toBe(3000);
    expect(metrics.code.insertions).toBe(50);
    expect(metrics.code.deletions).toBe(10);
    expect(metrics.code.files_modified).toBe(1);
    expect(metrics.delegations.total).toBe(2);
    expect(metrics.delegations.by_target).toEqual({ implementer: 1, reviewer: 1 });
    expect(metrics.delegations.re_delegations).toBe(0);
    expect(metrics.policy.commands_run).toBe(1);
    expect(metrics.policy.commands_blocked).toBe(1);

    // Validate against schema
    const parsed = RunMetricsSchema.safeParse(metrics);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Historian prompt
// ---------------------------------------------------------------------------

describe('historian prompt', () => {
  it('contains "Quality Metrics Analysis"', () => {
    const promptDir = path.join(__dirname, '..', '..', 'prompts');
    const historian = readFileSync(path.join(promptDir, 'historian.md'), 'utf-8');
    expect(historian).toContain('Quality Metrics Analysis');
  });
});
