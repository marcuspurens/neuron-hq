import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/concept-extraction.md'), 'utf-8');

describe('concept-extraction.md — critical instructions', () => {
  it('defines all five facets', () => {
    expect(prompt).toMatch(/topic/);
    expect(prompt).toMatch(/entity/);
    expect(prompt).toMatch(/method/);
    expect(prompt).toMatch(/domain/);
    expect(prompt).toMatch(/tool/);
  });

  it('requires JSON output format', () => {
    expect(prompt).toMatch(/concepts/);
    expect(prompt).toMatch(/facet/);
    expect(prompt).toMatch(/broaderConcept/);
  });

  it('mentions standardRefs', () => {
    expect(prompt).toMatch(/standardRefs/);
  });

  it('has text placeholder', () => {
    expect(prompt).toMatch(/\{\{text\}\}/);
  });

  it('instructs to extract from multiple facets', () => {
    expect(prompt).toMatch(/FLERA facetter/i);
  });

  it('mentions broader concept parent relationships', () => {
    expect(prompt).toMatch(/bredare begrepp|parent/i);
  });
});
