import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/pdf-vision.md'), 'utf-8');

describe('pdf-vision.md — critical instructions', () => {
  it('exists and is not empty', () => {
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('mentions TEXT_ONLY response for plain text pages', () => {
    expect(prompt).toMatch(/TEXT_ONLY/);
  });

  it('requires page type classification', () => {
    expect(prompt).toMatch(/PAGE TYPE/);
  });

  it('requires data extraction', () => {
    expect(prompt).toMatch(/DATA/);
  });

  it('requires precise numbers', () => {
    expect(prompt).toMatch(/precise|exact/i);
  });

  it('includes language detection', () => {
    expect(prompt).toMatch(/LANGUAGE/);
  });
});
