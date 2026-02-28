import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/manager.md'), 'utf-8');

describe('manager.md — knowledge graph planning', () => {
  it('contains "Consult Knowledge Graph" section', () => {
    expect(prompt).toMatch(/Consult Knowledge Graph/);
  });

  it('references graph_query with type filter', () => {
    expect(prompt).toMatch(/graph_query.*type/);
  });

  it('mentions pattern label', () => {
    expect(prompt).toMatch(/type.*pattern|"pattern"/);
  });

  it('mentions error/bug/risk label', () => {
    expect(prompt).toMatch(/error|bug|risk/i);
  });

  it('mentions decision label', () => {
    expect(prompt).toMatch(/decision/i);
  });

  it('instructs to use graph results in planning', () => {
    expect(prompt).toMatch(/Avoid repeating known mistakes|Follow established patterns|Respect previous.*decisions/i);
  });

  it('has fallback for empty graph', () => {
    expect(prompt).toMatch(/graph returns no relevant nodes.*proceed normally|proceed normally/i);
  });
});
