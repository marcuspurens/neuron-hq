import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/librarian.md'), 'utf-8');

describe('librarian.md — critical instructions', () => {
  it('documents the librarian role as per-run internal research', () => {
    expect(prompt).toMatch(/per-run|per run/i);
    expect(prompt).toMatch(/kodbas|codebase/i);
  });

  it('instructs to read techniques.md for existing knowledge', () => {
    expect(prompt).toMatch(/techniques\.md/);
    expect(prompt).toMatch(/read_memory_file/);
  });

  it('instructs to read the target codebase', () => {
    expect(prompt).toMatch(/grep|glob|read/i);
  });

  it('differentiates from Researcher role', () => {
    expect(prompt).toMatch(/Researcher/);
    expect(prompt).toMatch(/internally|internt/i);
  });

  it('produces research_brief.md', () => {
    expect(prompt).toMatch(/research_brief\.md/);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('techniques.md', 'REMOVED');
    expect(modified).not.toMatch(/techniques\.md/);
  });
});
