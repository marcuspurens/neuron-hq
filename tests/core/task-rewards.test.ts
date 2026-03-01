import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  TaskScoreSchema,
  computeTaskScore,
  extractTaskMetrics,
  findSimilarTaskScores,
  computeAllTaskScores,
  type TaskScore,
} from '../../src/core/task-rewards.js';

// ---------------------------------------------------------------------------
// computeTaskScore
// ---------------------------------------------------------------------------

describe('computeTaskScore', () => {
  const base = {
    task_id: 'T1',
    description: 'Create a widget',
    run_id: '20260301-0800-test',
    tokens_input: 1000,
    tokens_output: 500,
    commands_run: 5,
    commands_blocked: 0,
    diff_insertions: 20,
    diff_deletions: 5,
    re_delegations: 0,
  };

  it('returns efficiency 1.0 for 1 iteration', () => {
    const score = computeTaskScore({ ...base, iterations_used: 1 });
    expect(score.scores.efficiency).toBeCloseTo(1.0);
  });

  it('returns efficiency 0.85 for 2 iterations', () => {
    const score = computeTaskScore({ ...base, iterations_used: 2 });
    expect(score.scores.efficiency).toBeCloseTo(0.85);
  });


  it('returns efficiency 0.7 for 3 iterations', () => {
    const score = computeTaskScore({ ...base, iterations_used: 3 });
    expect(score.scores.efficiency).toBeCloseTo(0.7);
  });

  it('returns efficiency 0.4 for 5 iterations', () => {
    const score = computeTaskScore({ ...base, iterations_used: 5 });
    expect(score.scores.efficiency).toBeCloseTo(0.4);
  });

  it('floors efficiency at 0.1 for 7+ iterations', () => {
    const score = computeTaskScore({ ...base, iterations_used: 7 });
    expect(score.scores.efficiency).toBeCloseTo(0.1);
    const score10 = computeTaskScore({ ...base, iterations_used: 10 });
    expect(score10.scores.efficiency).toBeCloseTo(0.1);
  });

  it('returns safety 1.0 for 0 blocked commands', () => {
    const score = computeTaskScore({ ...base, commands_blocked: 0 });
    expect(score.scores.safety).toBeCloseTo(1.0);
  });


  it('returns safety 0.4 for 3 blocked commands', () => {
    const score = computeTaskScore({ ...base, commands_blocked: 3, iterations_used: 1 });
    expect(score.scores.safety).toBeCloseTo(0.4);
  });

  it('returns safety 0.0 for 5+ blocked commands', () => {
    const score = computeTaskScore({ ...base, commands_blocked: 5 });
    expect(score.scores.safety).toBeCloseTo(0.0);
    const score6 = computeTaskScore({ ...base, commands_blocked: 6 });
    expect(score6.scores.safety).toBeCloseTo(0.0);
  });

  it('returns first_pass 1.0 when no re-delegations', () => {
    const score = computeTaskScore({ ...base, re_delegations: 0 });
    expect(score.scores.first_pass).toBe(1.0);
  });

  it('returns first_pass 0.5 when re-delegations > 0', () => {
    const score = computeTaskScore({ ...base, re_delegations: 2 });
    expect(score.scores.first_pass).toBe(0.5);
  });

  it('computes correct aggregate', () => {
    const score = computeTaskScore({ ...base, iterations_used: 1 });
    // efficiency=1.0, safety=1.0, first_pass=1.0
    // aggregate = 1.0*0.5 + 1.0*0.3 + 1.0*0.2 = 1.0
    expect(score.aggregate).toBeCloseTo(1.0);
  });

  it('computes correct aggregate with mixed scores', () => {
    const score = computeTaskScore({
      ...base,
      iterations_used: 5,
      commands_blocked: 2,
      re_delegations: 1,
    });
    // efficiency=0.4, safety=0.6, first_pass=0.5
    // aggregate = 0.4*0.5 + 0.6*0.3 + 0.5*0.2 = 0.2 + 0.18 + 0.1 = 0.48
    expect(score.aggregate).toBeCloseTo(0.48);
  });

  it('includes verdict when provided', () => {
    const score = computeTaskScore({ ...base, iterations_used: 1, verdict: 'PASS' });
    expect(score.verdict).toBe('PASS');
  });

  it('verdict is undefined when not provided', () => {
    const score = computeTaskScore({ ...base, iterations_used: 1 });
    expect(score.verdict).toBeUndefined();
  });

  it('validates against TaskScoreSchema', () => {
    const score = computeTaskScore({ ...base, iterations_used: 3 });
    const parsed = TaskScoreSchema.safeParse(score);
    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractTaskMetrics
// ---------------------------------------------------------------------------

describe('extractTaskMetrics', () => {
  const taskPlan = [
    { id: 'T1', description: 'Create widget' },
    { id: 'T2', description: 'Add tests' },
  ];

  it('returns zeroed metrics for empty audit entries', () => {
    const result = extractTaskMetrics([], taskPlan);
    expect(result).toHaveLength(2);
    expect(result[0].task_id).toBe('T1');
    expect(result[0].iterations_used).toBe(0);
    expect(result[0].tokens_input).toBe(0);
    expect(result[1].task_id).toBe('T2');
  });

  it('groups entries by task_id field', () => {
    const entries = [
      { task_id: 'T1', tool: 'bash_exec', allowed: true, role: 'implementer' },
      { task_id: 'T1', tool: 'bash_exec', allowed: true, role: 'implementer' },
      { task_id: 'T2', tool: 'bash_exec', allowed: true, role: 'implementer' },
    ];
    const result = extractTaskMetrics(entries, taskPlan);
    expect(result[0].commands_run).toBe(2);
    expect(result[1].commands_run).toBe(1);
  });

  it('matches entries by note field when no task_id', () => {
    const entries = [
      { note: 'Working on T1 implementation', tool: 'bash_exec', allowed: true, role: 'implementer' },
    ];
    const result = extractTaskMetrics(entries, taskPlan);
    expect(result[0].commands_run).toBe(1);
    expect(result[1].commands_run).toBe(0);
  });

  it('counts commands_blocked correctly', () => {
    const entries = [
      { task_id: 'T1', tool: 'bash_exec', allowed: false, role: 'implementer' },
      { task_id: 'T1', tool: 'bash_exec', allowed: false, role: 'implementer' },
    ];
    const result = extractTaskMetrics(entries, taskPlan);
    expect(result[0].commands_blocked).toBe(2);
  });

  it('sums diff stats', () => {
    const entries = [
      { task_id: 'T1', tool: 'write_file', allowed: true, role: 'implementer', diff_stats: { additions: 10, deletions: 3 } },
      { task_id: 'T1', tool: 'write_file', allowed: true, role: 'implementer', diff_stats: { additions: 5, deletions: 2 } },
    ];
    const result = extractTaskMetrics(entries, taskPlan);
    expect(result[0].diff_insertions).toBe(15);
    expect(result[0].diff_deletions).toBe(5);
  });

  it('counts re-delegations (extra delegate_to_implementer calls)', () => {
    const entries = [
      { task_id: 'T1', tool: 'delegate_to_implementer', allowed: true, role: 'manager' },
      { task_id: 'T1', tool: 'delegate_to_implementer', allowed: true, role: 'manager' },
      { task_id: 'T1', tool: 'delegate_to_implementer', allowed: true, role: 'manager' },
    ];
    const result = extractTaskMetrics(entries, taskPlan);
    expect(result[0].re_delegations).toBe(2);
  });

  it('sums token fields if present', () => {
    const entries = [
      { task_id: 'T1', tool: 'bash_exec', allowed: true, role: 'implementer', tokens_input: 500, tokens_output: 100 },
      { task_id: 'T1', tool: 'bash_exec', allowed: true, role: 'implementer', tokens_input: 300, tokens_output: 200 },
    ];
    const result = extractTaskMetrics(entries, taskPlan);
    expect(result[0].tokens_input).toBe(800);
    expect(result[0].tokens_output).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// findSimilarTaskScores
// ---------------------------------------------------------------------------

describe('findSimilarTaskScores', () => {
  const makeScore = (desc: string): TaskScore => ({
    task_id: 'T1',
    description: desc,
    run_id: 'run-1',
    iterations_used: 1,
    tokens_input: 0,
    tokens_output: 0,
    commands_run: 0,
    commands_blocked: 0,
    diff_insertions: 0,
    diff_deletions: 0,
    re_delegations: 0,
    scores: { efficiency: 1, safety: 1, first_pass: 1 },
    aggregate: 1,
  });

  it('finds similar descriptions', () => {
    const historical = [
      makeScore('Create widget component'),
      makeScore('Add unit tests for auth'),
      makeScore('Create button component'),
    ];
    const result = findSimilarTaskScores(historical, 'Create new component', 0.3);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // 'Create widget component' and 'Create button component' should match
  });

  it('returns empty array when nothing matches', () => {
    const historical = [makeScore('refactor database layer')];
    const result = findSimilarTaskScores(historical, 'Create UI widget', 0.8);
    expect(result).toHaveLength(0);
  });

  it('sorts by similarity descending', () => {
    const historical = [
      makeScore('Add more tests'),
      makeScore('Create widget tests for the app'),
      makeScore('Create widget component tests'),
    ];
    const result = findSimilarTaskScores(historical, 'Create widget tests', 0.3);
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Most similar should be first
    if (result.length >= 2) {
      // Each result should have description more similar to query than the next
      expect(result[0].description).toContain('widget');
    }
  });

  it('returns empty for empty historical scores', () => {
    const result = findSimilarTaskScores([], 'anything');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TaskScoreSchema
// ---------------------------------------------------------------------------

describe('TaskScoreSchema', () => {
  it('rejects aggregate > 1', () => {
    const invalid = {
      task_id: 'T1',
      description: 'test',
      run_id: 'run-1',
      iterations_used: 1,
      tokens_input: 0,
      tokens_output: 0,
      commands_run: 0,
      commands_blocked: 0,
      diff_insertions: 0,
      diff_deletions: 0,
      re_delegations: 0,
      scores: { efficiency: 1, safety: 1, first_pass: 1 },
      aggregate: 1.5,
    };
    expect(TaskScoreSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects negative scores', () => {
    const invalid = {
      task_id: 'T1',
      description: 'test',
      run_id: 'run-1',
      iterations_used: 1,
      tokens_input: 0,
      tokens_output: 0,
      commands_run: 0,
      commands_blocked: 0,
      diff_insertions: 0,
      diff_deletions: 0,
      re_delegations: 0,
      scores: { efficiency: -0.1, safety: 1, first_pass: 1 },
      aggregate: 0.5,
    };
    expect(TaskScoreSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts valid verdict values', () => {
    const valid = {
      task_id: 'T1',
      description: 'test',
      run_id: 'run-1',
      iterations_used: 1,
      tokens_input: 0,
      tokens_output: 0,
      commands_run: 0,
      commands_blocked: 0,
      diff_insertions: 0,
      diff_deletions: 0,
      re_delegations: 0,
      scores: { efficiency: 1, safety: 1, first_pass: 1 },
      aggregate: 1,
      verdict: 'PARTIAL',
    };
    expect(TaskScoreSchema.safeParse(valid).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeAllTaskScores (integration)
// ---------------------------------------------------------------------------

describe('computeAllTaskScores', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-rewards-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('produces task_scores.jsonl from run directory', async () => {
    // task_plan.md
    await fs.writeFile(
      path.join(tempDir, 'task_plan.md'),
      '- T1: Create widget component\n- T2: Add unit tests\n',
    );

    // audit.jsonl
    const auditLines = [
      JSON.stringify({ ts: '2026-03-01T00:00:00Z', task_id: 'T1', role: 'implementer', tool: 'bash_exec', allowed: true }),
      JSON.stringify({ ts: '2026-03-01T00:01:00Z', task_id: 'T1', role: 'implementer', tool: 'write_file', allowed: true, diff_stats: { additions: 30, deletions: 5 } }),
      JSON.stringify({ ts: '2026-03-01T00:02:00Z', task_id: 'T2', role: 'implementer', tool: 'bash_exec', allowed: true }),
    ];
    await fs.writeFile(path.join(tempDir, 'audit.jsonl'), auditLines.join('\n') + '\n');

    // manifest.json
    await fs.writeFile(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify({ runid: '20260301-0800-test' }),
    );

    // usage.json
    await fs.writeFile(
      path.join(tempDir, 'usage.json'),
      JSON.stringify({ runid: '20260301-0800-test', total_input_tokens: 2000, total_output_tokens: 500 }),
    );

    const scores = await computeAllTaskScores(tempDir);
    expect(scores).toHaveLength(2);
    expect(scores[0].task_id).toBe('T1');
    expect(scores[0].run_id).toBe('20260301-0800-test');
    expect(scores[0].diff_insertions).toBe(30);
    expect(scores[1].task_id).toBe('T2');

    // Verify file was written
    const content = await fs.readFile(path.join(tempDir, 'task_scores.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.task_id).toBe('T1');
  });

  it('handles missing files gracefully', async () => {
    // Only task_plan.md exists
    await fs.writeFile(
      path.join(tempDir, 'task_plan.md'),
      '- T1: Do something\n',
    );

    const scores = await computeAllTaskScores(tempDir);
    expect(scores).toHaveLength(1);
    expect(scores[0].task_id).toBe('T1');
    expect(scores[0].iterations_used).toBe(0);
  });

  it('parses table-format task plan', async () => {
    await fs.writeFile(
      path.join(tempDir, 'task_plan.md'),
      '| T1 | Create widget | files |\n| T2 | Add tests | files |\n',
    );
    await fs.writeFile(path.join(tempDir, 'audit.jsonl'), '');
    await fs.writeFile(path.join(tempDir, 'manifest.json'), JSON.stringify({ runid: 'test-run' }));

    const scores = await computeAllTaskScores(tempDir);
    expect(scores).toHaveLength(2);
    expect(scores[0].description).toBe('Create widget');
    expect(scores[1].description).toBe('Add tests');
  });

  it('returns empty array for empty task plan', async () => {
    await fs.writeFile(path.join(tempDir, 'task_plan.md'), '# No tasks here\n');
    const scores = await computeAllTaskScores(tempDir);
    expect(scores).toHaveLength(0);
  });
});
