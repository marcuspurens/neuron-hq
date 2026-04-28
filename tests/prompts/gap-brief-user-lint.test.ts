import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/gap-brief-user.md'), 'utf-8');

describe('gap-brief-user.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('has primary gap placeholder', () => {
    expect(prompt).toMatch(/\{\{primaryGap\}\}/);
  });

  it('has related gaps placeholder', () => {
    expect(prompt).toMatch(/\{\{relatedGaps\}\}/);
  });

  it('requires JSON response with suggestions', () => {
    expect(prompt).toMatch(/suggestions/);
    expect(prompt).toMatch(/JSON/i);
  });
});
