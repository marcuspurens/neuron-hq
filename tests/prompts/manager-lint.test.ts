import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/manager.md'), 'utf-8');

describe('manager.md — critical instructions', () => {
  it('forbids # comments in bash commands', () => {
    expect(prompt).toMatch(/Never.*#|#.*policy|comment.*block/i);
  });

  it('instructs manager to be coordinator not performer', () => {
    expect(prompt).toMatch(/coordinator/i);
  });

  it('instructs to write artifacts to runs directory', () => {
    expect(prompt).toMatch(/runs.*dir|Run artifacts dir/i);
  });

  it('instructs not to repeat researcher analysis', () => {
    expect(prompt).toMatch(/do NOT repeat|not.*repeat/i);
  });

  it('instructs to use read_memory_file for librarian output', () => {
    expect(prompt).toMatch(/read_memory_file/);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('STOPLIGHT', 'REMOVED');
    expect(modified).not.toMatch(/STOPLIGHT/);
  });

  it('includes Meta-trigger instructions for meta-analysis', () => {
    expect(prompt).toMatch(/Meta-trigger/);
    expect(prompt).toMatch(/META_ANALYSIS/);
  });

  it('instructs manager to use implementer handoff', () => {
    expect(prompt).toMatch(/IMPLEMENTER HANDOFF/i);
  });
});
