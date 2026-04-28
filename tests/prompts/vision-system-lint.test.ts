import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/vision-system.md'), 'utf-8');

describe('vision-system.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('requires exact reporting', () => {
    expect(prompt).toMatch(/EXACTLY/);
  });

  it('prohibits inference', () => {
    expect(prompt).toMatch(/[Nn]ever infer/);
  });

  it('requires marking unclear text', () => {
    expect(prompt).toMatch(/\[unclear\]/);
  });

  it('mentions knowledge graph purpose', () => {
    expect(prompt).toMatch(/knowledge graph/i);
  });
});
