import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/emergent-gaps.md'), 'utf-8');

describe('emergent-gaps.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('mentions follow-up questions', () => {
    expect(prompt).toMatch(/follow-up/i);
  });

  it('mentions JSON output format', () => {
    expect(prompt).toMatch(/questions/);
    expect(prompt).toMatch(/JSON/i);
  });

  it('mentions things not explained', () => {
    expect(prompt).toMatch(/explained/i);
  });

  it('mentions researchable questions', () => {
    expect(prompt).toMatch(/researchable/i);
  });
});
