import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/intake-metadata.md'), 'utf-8');

describe('intake-metadata.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('requires JSON output with tags', () => {
    expect(prompt).toMatch(/tags/);
    expect(prompt).toMatch(/JSON/i);
  });

  it('requires language detection', () => {
    expect(prompt).toMatch(/language/i);
  });

  it('requires content_type classification', () => {
    expect(prompt).toMatch(/content_type/);
  });

  it('has context placeholder', () => {
    expect(prompt).toMatch(/\{\{context\}\}/);
  });

  it('requires summary field', () => {
    expect(prompt).toMatch(/summary/i);
  });
});
