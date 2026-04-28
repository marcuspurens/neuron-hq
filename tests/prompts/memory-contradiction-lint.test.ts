import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/memory-contradiction.md'), 'utf-8');

describe('memory-contradiction.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(20);
  });

  it('has new text placeholder', () => {
    expect(prompt).toMatch(/\{\{newText\}\}/);
  });

  it('has existing text placeholder', () => {
    expect(prompt).toMatch(/\{\{existingText\}\}/);
  });

  it('requires JSON response with contradicts field', () => {
    expect(prompt).toMatch(/contradicts/);
    expect(prompt).toMatch(/JSON/i);
  });
});
