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

  it('requires truncating output to max 30 lines', () => {
    expect(prompt).toMatch(/30\s+lines/);
  });

  it('requires one-line verdict format (TESTS PASS / TESTS FAILING)', () => {
    expect(prompt).toMatch(/TESTS PASS/);
    expect(prompt).toMatch(/TESTS FAILING/);
  });

  it('instructs to discover test framework automatically', () => {
    expect(prompt).toMatch(/[Dd]iscover|detect/);
    expect(prompt).toMatch(/vitest|pytest/);
  });
});
