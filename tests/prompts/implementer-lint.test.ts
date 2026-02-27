import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/implementer.md'), 'utf-8');

describe('implementer.md — reliability guardrails', () => {
  it('instructs to run git status before commit', () => {
    expect(prompt).toMatch(/git status/i);
  });

  it('instructs to use git add -A (not individual files)', () => {
    expect(prompt).toMatch(/git add -A/);
  });

  it('has iteration budget warning', () => {
    expect(prompt).toMatch(/40.*iteration|iteration.*40/i);
  });

  it('mentions partial commit as fallback strategy', () => {
    expect(prompt).toMatch(/partial commit|commit what you have/i);
  });

  it('checklist item: verify all changed files staged before commit', () => {
    expect(prompt).toMatch(/ALL changed files.*staged|staged.*ALL changed files/i);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('git status', 'REMOVED');
    expect(modified).not.toMatch(/git status/i);
  });

  it('requires implementer_handoff.md to be written', () => {
    expect(prompt).toMatch(/implementer_handoff\.md/);
  });
});
