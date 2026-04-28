import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/transcript-polish.md'), 'utf-8');

describe('transcript-polish.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('mentions fixing spelling errors', () => {
    expect(prompt).toMatch(/spelling/i);
  });

  it('requires preserving original meaning', () => {
    expect(prompt).toMatch(/[Pp]reserve.*meaning/);
  });

  it('mentions corrected text output', () => {
    expect(prompt).toMatch(/corrected/i);
  });
});
