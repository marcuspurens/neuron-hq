import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/ask-system.md'), 'utf-8');

describe('ask-system.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('identifies as Aurora', () => {
    expect(prompt).toMatch(/Aurora/);
  });

  it('requires source-based answers', () => {
    expect(prompt).toMatch(/käll/i);
  });

  it('requires source references', () => {
    expect(prompt).toMatch(/\[Source/);
  });
});
