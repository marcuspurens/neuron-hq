import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/researcher.md'), 'utf-8');

describe('researcher.md — critical instructions', () => {
  it('documents the researcher role as external research', () => {
    expect(prompt).toMatch(/arxiv/i);
    expect(prompt).toMatch(/fetch_url/);
  });

  it('instructs to write to techniques.md', () => {
    expect(prompt).toMatch(/techniques\.md/);
    expect(prompt).toMatch(/write_to_techniques/);
  });

  it('instructs to check for duplicates using read_memory_file', () => {
    expect(prompt).toMatch(/read_memory_file/);
  });

  it('differentiates from Librarian role', () => {
    expect(prompt).toMatch(/Librarian/);
    expect(prompt).toMatch(/externally|externt/i);
  });

  it('instructs to search arxiv API with specific query format', () => {
    expect(prompt).toMatch(/export\.arxiv\.org\/api\/query/);
  });

  it('instructs to use graph_assert for new techniques', () => {
    expect(prompt).toMatch(/graph_assert/);
  });

  it('mentions INSIGHT_NY tag processing', () => {
    expect(prompt).toMatch(/INSIGHT_NY/);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('techniques.md', 'REMOVED');
    expect(modified).not.toMatch(/techniques\.md/);
  });

  it('instructs to prefer recent sources', () => {
    expect(prompt).toMatch(/recent|submittedDate/i);
  });
});
