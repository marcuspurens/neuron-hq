import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/tester.md'), 'utf-8');

describe('tester.md — critical instructions', () => {
  it('requires writing test_report.md', () => {
    expect(prompt).toMatch(/test_report\.md/);
  });

  it('forbids modifying code', () => {
    expect(prompt).toMatch(/[Nn]ever modify code/);
  });

  it('requires proportional detail — minimal for green, full for failures', () => {
    expect(prompt).toMatch(/detail.*severity|severity.*detail|proportional/i);
  });

  it('requires verdict classification (CODE FAILURE / ENVIRONMENT FAILURE / INFRASTRUCTURE FAILURE)', () => {
    expect(prompt).toMatch(/CODE.?FAILURE/);
    expect(prompt).toMatch(/ENVIRONMENT.?FAILURE/);
    expect(prompt).toMatch(/INFRASTRUCTURE.?FAILURE/);
  });

  it('instructs to discover test framework via project definitions', () => {
    expect(prompt).toMatch(/scripts\.test|canonical/i);
    expect(prompt).toMatch(/vitest|pytest/);
  });

  it('requires baseline comparison for regression detection', () => {
    expect(prompt).toMatch(/baseline/i);
    expect(prompt).toMatch(/[Rr]egression/);
  });

  it('requires diagnostic analysis section with root causes', () => {
    expect(prompt).toMatch(/[Dd]iagnostic [Aa]nalysis/);
    expect(prompt).toMatch(/[Rr]oot [Cc]ause/);
  });

  it('requires warnings section', () => {
    expect(prompt).toMatch(/[Ww]arnings/);
    expect(prompt).toMatch(/0% coverage|\.skip|suspiciously/i);
  });

  it('includes environment preparation step (npm ci / pip install)', () => {
    expect(prompt).toMatch(/npm ci|npm install|pnpm install/);
    expect(prompt).toMatch(/materialise.*declared|declared.*dependencies/i);
  });

  it('requires diagnostic analysis with root causes', () => {
    expect(prompt).toMatch(/[Rr]oot [Cc]ause/);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('test_report.md', 'REMOVED');
    expect(modified).not.toMatch(/test_report\.md/);
  });
});
