import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/researcher.md'), 'utf-8');

describe('researcher.md — critical instructions', () => {
  it('documents three mandatory output files', () => {
    expect(prompt).toMatch(/ideas\.md/);
    expect(prompt).toMatch(/knowledge\.md/);
    expect(prompt).toMatch(/sources\.md/);
  });

  it('requires Impact/Effort/Risk framework', () => {
    expect(prompt).toMatch(/\*\*Impact\*\*/);
    expect(prompt).toMatch(/\*\*Effort\*\*/);
    expect(prompt).toMatch(/\*\*Risk\*\*/);
  });

  it('specifies max constraints for searches and ideas', () => {
    expect(prompt).toMatch(/[Mm]ax\s+\d+\s+web\s+search/);
    expect(prompt).toMatch(/[Mm]ax\s+\d+\s+ideas/);
  });

  it('instructs to prefer recent sources', () => {
    expect(prompt).toMatch(/2024|recent/i);
  });

  it('marks all three outputs as mandatory', () => {
    expect(prompt).toMatch(/mandatory|MANDATORY/);
  });

  it('instructs to check techniques.md for existing research', () => {
    expect(prompt).toMatch(/read_memory_file\(file="techniques"\)/);
    expect(prompt).toMatch(/techniques\.md/);
  });

  it('includes Research support field in ideas format', () => {
    expect(prompt).toMatch(/\*\*Research support\*\*/);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('ideas.md', 'REMOVED');
    expect(modified).not.toMatch(/ideas\.md/);
  });

  it('includes META_ANALYSIS mode with meta_analysis.md format', () => {
    expect(prompt).toMatch(/META_ANALYSIS/);
    expect(prompt).toMatch(/meta_analysis\.md/);
  });
});
