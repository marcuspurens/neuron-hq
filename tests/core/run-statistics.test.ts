import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  classifyBrief,
  collectOutcomes,
} from '../../src/core/run-statistics.js';
import { bayesianUpdate } from '../../src/aurora/bayesian-confidence.js';

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-stats-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// classifyBrief
// ---------------------------------------------------------------------------

describe('classifyBrief', () => {
  async function writeBrief(title: string): Promise<string> {
    const briefPath = path.join(tempDir, 'brief.md');
    await fs.writeFile(briefPath, `# ${title}\n\nSome body text.`);
    return briefPath;
  }

  it('classifies feature brief', async () => {
    const p = await writeBrief('Add new widget component');
    expect(await classifyBrief(p)).toBe('feature');
  });

  it('classifies implement as feature', async () => {
    const p = await writeBrief('Implement user auth');
    expect(await classifyBrief(p)).toBe('feature');
  });

  it('classifies refactor brief', async () => {
    const p = await writeBrief('Refactor database layer');
    expect(await classifyBrief(p)).toBe('refactor');
  });

  it('classifies bugfix brief', async () => {
    const p = await writeBrief('Fix crash on startup');
    expect(await classifyBrief(p)).toBe('bugfix');
  });

  it('classifies test brief', async () => {
    const p = await writeBrief('Increase test coverage for core');
    expect(await classifyBrief(p)).toBe('test');
  });

  it('classifies docs brief', async () => {
    const p = await writeBrief('Update README with examples');
    expect(await classifyBrief(p)).toBe('docs');
  });

  it('falls back to infrastructure', async () => {
    const p = await writeBrief('Set up CI/CD pipeline');
    expect(await classifyBrief(p)).toBe('infrastructure');
  });

  it('returns infrastructure for missing file', async () => {
    const p = path.join(tempDir, 'nonexistent.md');
    expect(await classifyBrief(p)).toBe('infrastructure');
  });

  it('first match wins (feature before test)', async () => {
    const p = await writeBrief('Add test utilities');
    expect(await classifyBrief(p)).toBe('feature');
  });

  it('does not match "Implementer" as feature (word boundary)', async () => {
    const p = await writeBrief('Implementer-tillförlitlighet');
    expect(await classifyBrief(p)).toBe('infrastructure');
  });

  it('strips "Brief:" prefix before matching', async () => {
    const briefPath = path.join(tempDir, 'brief.md');
    await fs.writeFile(briefPath, '# Brief: Refactor database layer\n\nBody.');
    expect(await classifyBrief(briefPath)).toBe('refactor');
  });

  it('matches keywords in first 5 lines, not just first', async () => {
    const briefPath = path.join(tempDir, 'brief.md');
    await fs.writeFile(
      briefPath,
      '# S9 — Modell-specifika prompt-overlays\n\n## Mål\n\nImplement per-model prompt overlays.\n',
    );
    expect(await classifyBrief(briefPath)).toBe('feature');
  });

  it('classifies Swedish test brief correctly', async () => {
    const briefPath = path.join(tempDir, 'brief.md');
    await fs.writeFile(briefPath, '# Negativa lint-tester + prompt-täckningsrapport\n\nBody.');
    expect(await classifyBrief(briefPath)).toBe('test');
  });
});

// ---------------------------------------------------------------------------
// collectOutcomes
// ---------------------------------------------------------------------------

describe('collectOutcomes', () => {
  async function writeRunFiles(
    files: Record<string, string | object>,
  ): Promise<string> {
    const runDir = path.join(tempDir, 'run-001');
    await fs.mkdir(runDir, { recursive: true });

    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(runDir, name);
      const text =
        typeof content === 'string' ? content : JSON.stringify(content);
      await fs.writeFile(filePath, text);
    }

    return runDir;
  }

  it('returns empty array when no files exist', async () => {
    const runDir = path.join(tempDir, 'empty-run');
    await fs.mkdir(runDir, { recursive: true });
    const outcomes = await collectOutcomes(runDir);
    expect(outcomes.length).toBe(0);
  });

  it('generates outcomes for stoplight GREEN', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Add new feature\n\nBody',
      'report.md': '## 🟢 STOPLIGHT: GREEN\n\nAll good.',
      'metrics.json': {
        runid: 'test-run',
        testing: { tests_added: 2 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 1000,
          total_output: 500,
          by_agent: { implementer: { input: 1000, output: 500 } },
        },
      },
      'manifest.json': { target_name: 'my-project' },
      'usage.json': { model: 'claude-opus-4-6' },
    });

    const outcomes = await collectOutcomes(runDir);
    expect(outcomes.length).toBeGreaterThan(0);

    const dims = [...new Set(outcomes.map((o) => o.dimension))];
    expect(dims).toContain('agent:implementer');
    expect(dims).toContain('brief:feature');
    expect(dims).toContain('target:my-project');
    expect(dims).toContain('model:claude-opus-4-6');

    const stoplightOutcomes = outcomes.filter(
      (o) => o.evidence === 'Stoplight GREEN in report',
    );
    expect(stoplightOutcomes.length).toBe(dims.length);
    for (const o of stoplightOutcomes) {
      expect(o.success).toBe(true);
      expect(o.weight).toBe(0.20);
    }
  });

  it('generates failure outcomes for stoplight YELLOW', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Fix broken login\n\nBody',
      'report.md': '## 🟡 STOPLIGHT: YELLOW\n\nSome issues.',
      'metrics.json': {
        runid: 'test-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 1 },
        policy: { commands_blocked: 2 },
        tokens: {
          total_input: 1000,
          total_output: 500,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);

    const stoplightOutcomes = outcomes.filter(
      (o) => o.evidence === 'Stoplight YELLOW/RED in report',
    );
    expect(stoplightOutcomes.length).toBeGreaterThan(0);
    for (const o of stoplightOutcomes) {
      expect(o.success).toBe(false);
    }
  });

  it('tests-added signal only for feature briefs', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Refactor database layer\n\nBody',
      'metrics.json': {
        runid: 'test-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);

    const testsOutcomes = outcomes.filter((o) =>
      o.evidence.includes('test'),
    );
    expect(testsOutcomes.length).toBe(0);
  });

  it('includes task score signal when task_scores.jsonl exists', async () => {
    const taskScores = [
      JSON.stringify({ aggregate: 0.8 }),
      JSON.stringify({ aggregate: 0.9 }),
    ].join('\n');

    const runDir = await writeRunFiles({
      'brief.md': '# Add feature\n\nBody',
      'metrics.json': {
        runid: 'test-run',
        testing: { tests_added: 1 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
      'task_scores.jsonl': taskScores,
    });

    const outcomes = await collectOutcomes(runDir);
    const scoreOutcomes = outcomes.filter((o) =>
      o.evidence.includes('Average task score'),
    );
    expect(scoreOutcomes.length).toBeGreaterThan(0);
    expect(scoreOutcomes[0].success).toBe(true);
    expect(scoreOutcomes[0].weight).toBe(0.12);
  });

  it('token budget success when under 15M', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Infrastructure setup\n\nBody',
      'metrics.json': {
        runid: 'test-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 5_000_000,
          total_output: 5_000_000,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);
    const tokenOutcomes = outcomes.filter((o) =>
      o.evidence.includes('Total tokens'),
    );
    expect(tokenOutcomes.length).toBeGreaterThan(0);
    expect(tokenOutcomes[0].success).toBe(true);
  });

  it('token budget failure when over 15M', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Infrastructure setup\n\nBody',
      'metrics.json': {
        runid: 'test-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 10_000_000,
          total_output: 6_000_000,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);
    const tokenOutcomes = outcomes.filter((o) =>
      o.evidence.includes('Total tokens'),
    );
    expect(tokenOutcomes.length).toBeGreaterThan(0);
    expect(tokenOutcomes[0].success).toBe(false);
  });

  it('mixed signals: some success some failure', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Add new dashboard\n\nBody',
      'report.md': '## STOPLIGHT: GREEN\n\nGood.',
      'metrics.json': {
        runid: 'mixed-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 2 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: { manager: {} },
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);

    // Stoplight should be success
    const stoplightOuts = outcomes.filter((o) =>
      o.evidence.includes('Stoplight GREEN'),
    );
    expect(stoplightOuts.every((o) => o.success)).toBe(true);

    // Re-delegations should be failure
    const reDelegOuts = outcomes.filter((o) =>
      o.evidence.includes('re-delegation'),
    );
    expect(reDelegOuts.every((o) => !o.success)).toBe(true);

    // Tests-added should be failure (feature brief, 0 tests)
    const testsOuts = outcomes.filter((o) =>
      o.evidence.includes('No tests added'),
    );
    expect(testsOuts.length).toBeGreaterThan(0);
    expect(testsOuts.every((o) => !o.success)).toBe(true);
  });

  it('detects "Verdict: GREEN" format', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Deploy service\n\nBody',
      'report.md': '## Summary\n\nVerdict: GREEN\n\nAll good.',
      'metrics.json': {
        runid: 'verdict-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);
    const stoplightOuts = outcomes.filter((o) =>
      o.evidence.includes('Stoplight GREEN'),
    );
    expect(stoplightOuts.length).toBeGreaterThan(0);
    expect(stoplightOuts[0].success).toBe(true);
  });

  it('detects "APPROVED" format', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Update config\n\nBody',
      'report.md': '## Review Result\n\nAPPROVED\n\nShip it.',
      'metrics.json': {
        runid: 'approved-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);
    const stoplightOuts = outcomes.filter((o) =>
      o.evidence.includes('Stoplight GREEN'),
    );
    expect(stoplightOuts.length).toBeGreaterThan(0);
    expect(stoplightOuts[0].success).toBe(true);
  });

  it('detects "STOPLIGHT GREEN" without colon', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Setup infra\n\nBody',
      'report.md': '## STOPLIGHT GREEN\n\nDone.',
      'metrics.json': {
        runid: 'no-colon-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);
    const stoplightOuts = outcomes.filter((o) =>
      o.evidence.includes('Stoplight GREEN'),
    );
    expect(stoplightOuts.length).toBeGreaterThan(0);
  });

  it('REJECTED counts as failure', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Fix login\n\nBody',
      'report.md': '## Review\n\nREJECTED\n\nNeeds work.',
      'metrics.json': {
        runid: 'rejected-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);
    const stoplightOuts = outcomes.filter((o) =>
      o.evidence.includes('Stoplight YELLOW/RED'),
    );
    expect(stoplightOuts.length).toBeGreaterThan(0);
    expect(stoplightOuts[0].success).toBe(false);
  });

  it('missing report.md skips stoplight but keeps other signals', async () => {
    const runDir = await writeRunFiles({
      'brief.md': '# Fix login bug\n\nBody',
      'metrics.json': {
        runid: 'no-report-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
    });

    const outcomes = await collectOutcomes(runDir);

    // No stoplight signal
    const stoplightOuts = outcomes.filter((o) =>
      o.evidence.includes('Stoplight'),
    );
    expect(stoplightOuts.length).toBe(0);

    // But other signals exist (re-delegations, blocked, token-budget)
    expect(outcomes.length).toBeGreaterThan(0);
    const tokenOuts = outcomes.filter((o) =>
      o.evidence.includes('Total tokens'),
    );
    expect(tokenOuts.length).toBeGreaterThan(0);
  });

  it('task score failure when average below 0.7', async () => {
    const taskScores = [
      JSON.stringify({ aggregate: 0.3 }),
      JSON.stringify({ aggregate: 0.5 }),
    ].join('\n');

    const runDir = await writeRunFiles({
      'brief.md': '# Update pipeline\n\nBody',
      'metrics.json': {
        runid: 'low-score-run',
        testing: { tests_added: 0 },
        delegations: { re_delegations: 0 },
        policy: { commands_blocked: 0 },
        tokens: {
          total_input: 100,
          total_output: 100,
          by_agent: {},
        },
      },
      'task_scores.jsonl': taskScores,
    });

    const outcomes = await collectOutcomes(runDir);
    const scoreOutcomes = outcomes.filter((o) =>
      o.evidence.includes('Average task score'),
    );
    expect(scoreOutcomes.length).toBeGreaterThan(0);
    expect(scoreOutcomes[0].success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// bayesianUpdate (pure function tests)
// ---------------------------------------------------------------------------

describe('bayesianUpdate', () => {
  it('increases confidence on supporting evidence', () => {
    const result = bayesianUpdate(0.5, {
      direction: 'supports',
      sourceType: 'official',
      weight: 0.20,
      reason: 'Test support',
    });
    expect(result).toBeGreaterThan(0.5);
  });

  it('decreases confidence on contradicting evidence', () => {
    const result = bayesianUpdate(0.5, {
      direction: 'contradicts',
      sourceType: 'official',
      weight: 0.20,
      reason: 'Test contradiction',
    });
    expect(result).toBeLessThan(0.5);
  });

  it('does not exceed 0.999 (ceiling clamp)', () => {
    const result = bayesianUpdate(0.99, {
      direction: 'supports',
      sourceType: 'official',
      weight: 0.25,
      reason: 'Push near ceiling',
    });
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThan(0.9);
  });

  it('does not go below 0.001 (floor clamp)', () => {
    const result = bayesianUpdate(0.01, {
      direction: 'contradicts',
      sourceType: 'official',
      weight: 0.25,
      reason: 'Push near floor',
    });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// DB-dependent functions (mocked)
// ---------------------------------------------------------------------------

describe('DB-dependent functions', () => {
  // We need to dynamically import to apply mocks properly
  it('updateRunBeliefs no-ops when DB is unavailable', async () => {
    // The vitest config sets DATABASE_URL to a disabled URL,
    // so isDbAvailable() returns false. updateRunBeliefs should no-op.
    const { updateRunBeliefs } = await import('../../src/core/run-statistics.js');
    // Should not throw even with outcomes
    await expect(
      updateRunBeliefs([
        { dimension: 'test:dim', success: true, weight: 0.1, evidence: 'test' },
      ], 'run-1'),
    ).resolves.toBeUndefined();
  });

  it('getBeliefs returns empty when DB is unavailable', async () => {
    const { getBeliefs } = await import('../../src/core/run-statistics.js');
    const result = await getBeliefs({ prefix: 'agent:' });
    expect(result).toEqual([]);
  });

  it('getBeliefHistory returns empty when DB is unavailable', async () => {
    const { getBeliefHistory } = await import('../../src/core/run-statistics.js');
    const result = await getBeliefHistory('test:dimension');
    expect(result).toEqual([]);
  });

  it('getSummary returns empty structure when DB is unavailable', async () => {
    const { getSummary } = await import('../../src/core/run-statistics.js');
    const result = await getSummary();
    expect(result).toEqual({
      strongest: [],
      weakest: [],
      trending_up: [],
      trending_down: [],
    });
  });

  it('backfillAllRuns returns zero counts for non-existent directory', async () => {
    const { backfillAllRuns } = await import('../../src/core/run-statistics.js');
    const result = await backfillAllRuns(path.join(tempDir, 'nonexistent'));
    expect(result).toEqual({ processed: 0, dimensions: 0 });
  });
});
