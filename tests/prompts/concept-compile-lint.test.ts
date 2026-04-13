import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/concept-compile.md'), 'utf-8');

describe('concept-compile.md — critical instructions', () => {
  it('has all required template placeholders', () => {
    expect(prompt).toMatch(/\{\{concept_title\}\}/);
    expect(prompt).toMatch(/\{\{concept_facet\}\}/);
    expect(prompt).toMatch(/\{\{concept_description\}\}/);
    expect(prompt).toMatch(/\{\{concept_hierarchy\}\}/);
    expect(prompt).toMatch(/\{\{sources\}\}/);
    expect(prompt).toMatch(/\{\{gaps\}\}/);
  });

  it('instructs to write in markdown format', () => {
    expect(prompt).toMatch(/markdown/i);
  });

  it('instructs to begin with abstract', () => {
    expect(prompt).toMatch(/sammanfattning/i);
  });

  it('instructs to cite sources', () => {
    expect(prompt).toMatch(/källa/i);
  });

  it('requires epistemic status marking', () => {
    expect(prompt).toMatch(/epistemisk/i);
  });

  it('requires JSON block with abstract and relatedConcepts', () => {
    expect(prompt).toMatch(/abstract/);
    expect(prompt).toMatch(/relatedConcepts/);
  });

  it('specifies word count range', () => {
    expect(prompt).toMatch(/300.*2000/);
  });
});
