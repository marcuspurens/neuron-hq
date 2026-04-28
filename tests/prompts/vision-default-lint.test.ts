import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/vision-default.md'), 'utf-8');

describe('vision-default.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('mentions knowledge graph indexing', () => {
    expect(prompt).toMatch(/knowledge graph/i);
  });

  it('requires LAYOUT classification', () => {
    expect(prompt).toMatch(/LAYOUT/);
  });

  it('requires TEXT transcription', () => {
    expect(prompt).toMatch(/TEXT/);
  });

  it('handles decorative images', () => {
    expect(prompt).toMatch(/DECORATIVE/);
  });
});
