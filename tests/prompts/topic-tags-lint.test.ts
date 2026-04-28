import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/topic-tags.md'), 'utf-8');

describe('topic-tags.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('requires JSON array output', () => {
    expect(prompt).toMatch(/JSON array/i);
  });

  it('requires lowercase tags', () => {
    expect(prompt).toMatch(/lowercase/i);
  });

  it('specifies tag count range', () => {
    expect(prompt).toMatch(/5.*10/);
  });

  it('limits words per tag', () => {
    expect(prompt).toMatch(/1-3 words/);
  });
});
