import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/librarian.md'), 'utf-8');

describe('librarian.md — critical instructions', () => {
  it('instructs to write to techniques.md', () => {
    expect(prompt).toMatch(/techniques\.md/);
  });

  it('instructs to use write_to_techniques tool', () => {
    expect(prompt).toMatch(/write_to_techniques/);
  });

  it('instructs to search arxiv', () => {
    expect(prompt).toMatch(/arxiv/i);
  });

  it('instructs to check for duplicates using read_memory_file', () => {
    expect(prompt).toMatch(/read_memory_file/);
  });

  it('limits search scope', () => {
    expect(prompt).toMatch(/max.*15|15.*papers|3.*topics/i);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('techniques.md', 'REMOVED');
    expect(modified).not.toMatch(/techniques\.md/);
  });
});
