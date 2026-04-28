import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/semantic-split.md'), 'utf-8');

describe('semantic-split.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('requires JSON array output', () => {
    expect(prompt).toMatch(/JSON array/i);
  });

  it('specifies paragraph count range', () => {
    expect(prompt).toMatch(/3-8 paragraphs/);
  });

  it('excludes sentence 1 from output', () => {
    expect(prompt).toMatch(/do NOT include 1/i);
  });

  it('mentions topical coherence', () => {
    expect(prompt).toMatch(/topic/i);
  });
});
