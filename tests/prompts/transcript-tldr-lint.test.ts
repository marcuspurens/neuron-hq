import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/transcript-tldr.md'), 'utf-8');

describe('transcript-tldr.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('requires concise summary', () => {
    expect(prompt).toMatch(/2-3 sentence/i);
  });

  it('requires same language as transcript', () => {
    expect(prompt).toMatch(/same language/i);
  });

  it('prohibits meta-phrasing like "This video"', () => {
    expect(prompt).toMatch(/This video/);
  });
});
