import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/speaker-guesser.md'), 'utf-8');

describe('speaker-guesser.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('requires JSON array output', () => {
    expect(prompt).toMatch(/JSON array/i);
  });

  it('includes speakerLabel in output format', () => {
    expect(prompt).toMatch(/speakerLabel/);
  });

  it('includes confidence score', () => {
    expect(prompt).toMatch(/confidence/);
  });

  it('mentions video description as a source', () => {
    expect(prompt).toMatch(/video description/i);
  });
});
