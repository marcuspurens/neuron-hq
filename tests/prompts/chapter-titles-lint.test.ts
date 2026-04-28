import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/chapter-titles.md'), 'utf-8');

describe('chapter-titles.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('requires JSON array output', () => {
    expect(prompt).toMatch(/JSON array/i);
  });

  it('specifies title word count', () => {
    expect(prompt).toMatch(/3-6 words/);
  });

  it('requires title case', () => {
    expect(prompt).toMatch(/title case/i);
  });

  it('requires titles to equal excerpts count', () => {
    expect(prompt).toMatch(/MUST equal/);
  });
});
