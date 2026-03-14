import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/article-synthesis.md'), 'utf-8');

describe('article-synthesis.md — critical instructions', () => {
  it('instructs to write in markdown format', () => {
    expect(prompt).toMatch(/markdown/i);
  });

  it('instructs to begin with abstract', () => {
    expect(prompt).toMatch(/sammanfattning/i);
  });

  it('instructs to cite sources', () => {
    expect(prompt).toMatch(/källa/i);
  });

  it('requires JSON block with abstract and concepts', () => {
    expect(prompt).toMatch(/abstract/);
    expect(prompt).toMatch(/concepts/);
    expect(prompt).toMatch(/broaderConcept/);
    expect(prompt).toMatch(/facet/);
  });

  it('has sources and gaps placeholders', () => {
    expect(prompt).toMatch(/\{\{sources\}\}/);
    expect(prompt).toMatch(/\{\{gaps\}\}/);
  });

  it('specifies word count range', () => {
    expect(prompt).toMatch(/300.*1500/);
  });
});
