import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/gap-brief-system.md'), 'utf-8');

describe('gap-brief-system.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(10);
  });

  it('requires JSON output', () => {
    expect(prompt).toMatch(/JSON/);
  });

  it('mentions research assistant role', () => {
    expect(prompt).toMatch(/research assistant/i);
  });
});
