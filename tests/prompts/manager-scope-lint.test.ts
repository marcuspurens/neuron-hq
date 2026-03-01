import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/manager.md'), 'utf-8');

describe('Manager prompt — scope filtering', () => {
  it('contains scope: "universal" in knowledge-graph section', () => {
    expect(prompt).toMatch(/scope.*universal/i);
  });

  it('contains "Universal patterns" heading', () => {
    expect(prompt).toMatch(/Universal patterns/);
  });

  it('contains "Target-specific patterns" heading', () => {
    expect(prompt).toMatch(/Target-specific patterns/);
  });

  it('contains "Target-specific risks" heading', () => {
    expect(prompt).toMatch(/Target-specific risks/);
  });
});
