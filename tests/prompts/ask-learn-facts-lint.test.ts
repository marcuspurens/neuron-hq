import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/ask-learn-facts.md'), 'utf-8');

describe('ask-learn-facts.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('requires JSON array output', () => {
    expect(prompt).toMatch(/JSON/i);
  });

  it('limits to max 5 facts', () => {
    expect(prompt).toMatch(/[Mm]ax 5/);
  });

  it('prohibits speculation', () => {
    expect(prompt).toMatch(/spekulat/i);
  });

  it('has answer placeholder', () => {
    expect(prompt).toMatch(/\{\{answer\}\}/);
  });
});
