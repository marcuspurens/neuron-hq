import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/consolidator.md'), 'utf-8');

describe('consolidator.md — critical instructions', () => {
  it('instructs to merge duplicates', () => {
    expect(prompt).toMatch(/Merge Duplicates/);
  });

  it('instructs to use find_duplicate_candidates tool', () => {
    expect(prompt).toMatch(/find_duplicate_candidates/);
  });

  it('instructs to use graph_merge_nodes tool', () => {
    expect(prompt).toMatch(/graph_merge_nodes/);
  });

  it('instructs to strengthen connections via find_missing_edges', () => {
    expect(prompt).toMatch(/find_missing_edges/);
  });

  it('instructs to find stale nodes', () => {
    expect(prompt).toMatch(/find_stale_nodes/);
  });

  it('instructs to write consolidation_report.md', () => {
    expect(prompt).toMatch(/consolidation_report\.md/);
  });

  it('warns never to create new knowledge nodes', () => {
    expect(prompt).toMatch(/Never create new knowledge nodes/);
  });

  it('instructs conservative merges', () => {
    expect(prompt).toMatch(/conservative with merges/i);
  });

  it('includes self-reflection checklist', () => {
    expect(prompt).toMatch(/Self-Reflection/);
  });

  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('consolidation_report.md', 'REMOVED');
    expect(modified).not.toMatch(/consolidation_report\.md/);
  });
});
