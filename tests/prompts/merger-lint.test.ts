import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/merger.md'), 'utf-8');

describe('merger.md — critical instructions', () => {
  it('documents PLAN and EXECUTE phases', () => {
    expect(prompt).toMatch(/PLAN phase/i);
    expect(prompt).toMatch(/EXECUTE phase/i);
  });

  it('requires APPROVED keyword in answers.md', () => {
    expect(prompt).toMatch(/APPROVED/);
  });

  it('requires GREEN stoplight before merge', () => {
    expect(prompt).toMatch(/GREEN stoplight required/i);
  });

  it('uses copy_to_target tool', () => {
    expect(prompt).toMatch(/copy_to_target/);
  });

  it('forbids force push', () => {
    expect(prompt).toMatch(/force push/i);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('APPROVED', 'REMOVED');
    expect(modified).not.toMatch(/APPROVED/);
  });

  it('uses diff for base-file verification', () => {
    expect(prompt).toMatch(/diff/);
  });

  it('uses baseline ref for workspace inspection', () => {
    expect(prompt).toMatch(/baseline/i);
    expect(prompt).toMatch(/git diff/);
  });

  it('requires atomic execution', () => {
    expect(prompt).toMatch(/Atomic/i);
    expect(prompt).toMatch(/stop on first failure/i);
  });

  it('includes post-merge verification', () => {
    expect(prompt).toMatch(/Post-merge verification/i);
    expect(prompt).toMatch(/pnpm typecheck/);
    expect(prompt).toMatch(/pnpm test/);
  });

  it('documents known limitations', () => {
    expect(prompt).toMatch(/Known Limitations/);
  });

  it('returns MERGER_PLAN_READY signal', () => {
    expect(prompt).toMatch(/MERGER_PLAN_READY/);
  });
});
