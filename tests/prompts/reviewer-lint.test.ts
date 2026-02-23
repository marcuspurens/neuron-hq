import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/reviewer.md'), 'utf-8');

describe('reviewer.md — critical instructions', () => {
  it('requires Swedish summary table (Vad svärmen levererade)', () => {
    expect(prompt).toMatch(/Vad sv[äa]rmen levererade/i);
  });

  it('requires Planerat vs Levererat section', () => {
    expect(prompt).toMatch(/Planerat vs Levererat/i);
  });

  it('requires STOPLIGHT format in report', () => {
    expect(prompt).toMatch(/STOPLIGHT/);
  });

  it('must block on static analysis failure (ruff/mypy/tsc)', () => {
    expect(prompt).toMatch(/BLOCK/i);
    expect(prompt).toMatch(/static analysis/i);
  });

  it('forbids claiming something is done without running a command', () => {
    expect(prompt).toMatch(/NEVER claim|never.*claim|without.*command|run.*command/i);
  });
});
