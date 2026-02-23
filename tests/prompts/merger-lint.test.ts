import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/merger.md'), 'utf-8');

describe('merger.md — critical instructions', () => {
  it('documents PLAN and EXECUTE phases', () => {
    expect(prompt).toMatch(/PLAN phase/i);
    expect(prompt).toMatch(/EXECUTE phase/i);
  });

  it('requires APPROVED keyword in answers.md', () => {
    expect(prompt).toMatch(/APPROVED/);
  });

  it('forbids committing without user approval', () => {
    expect(prompt).toMatch(/NEVER commit without user approval/i);
  });

  it('uses copy_to_target tool', () => {
    expect(prompt).toMatch(/copy_to_target/);
  });

  it('forbids force push', () => {
    expect(prompt).toMatch(/force push/i);
  });
});
