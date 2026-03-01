import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const reviewerPrompt = readFileSync(
  path.join(process.cwd(), 'prompts', 'reviewer.md'),
  'utf-8',
);

describe('reviewer.md security-review ARCHIVE', () => {
  it('contains <!-- ARCHIVE: security-review --> marker', () => {
    expect(reviewerPrompt).toContain('<!-- ARCHIVE: security-review -->');
    expect(reviewerPrompt).toContain('<!-- /ARCHIVE: security-review -->');
  });

  it('contains Mandatory Security Checklist', () => {
    expect(reviewerPrompt).toMatch(/Mandatory Security Checklist/);
  });

  it('contains Security Verdict', () => {
    expect(reviewerPrompt).toMatch(/Security Verdict/);
  });
});
