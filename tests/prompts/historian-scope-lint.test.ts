import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/historian.md'), 'utf-8');

describe('Historian prompt — scope tagging', () => {
  it('contains "Scope Tagging" section', () => {
    expect(prompt).toMatch(/Scope Tagging/);
  });

  it('mentions "universal" scope', () => {
    expect(prompt).toMatch(/universal/);
  });

  it('mentions "project-specific" scope', () => {
    expect(prompt).toMatch(/project-specific/);
  });

  it('contains scope example in graph_assert call', () => {
    expect(prompt).toMatch(/scope.*universal/);
  });

  it('contains rule of thumb for scope classification', () => {
    expect(prompt).toMatch(/Rule of thumb/);
  });
});
