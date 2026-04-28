import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/briefing-summary.md'), 'utf-8');

describe('briefing-summary.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('requires Swedish response', () => {
    expect(prompt).toMatch(/svenska/i);
  });

  it('mentions knowledge gaps', () => {
    expect(prompt).toMatch(/kunskapsluckor/i);
  });
});
