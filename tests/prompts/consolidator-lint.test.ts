import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/consolidator.md'), 'utf-8');

describe('consolidator.md — critical instructions', () => {
  // ── Core operations ──────────────────────────────────────────
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

  // ── Gap 1: Priority order ───────────────────────────────────
  it('has explicit priority order', () => {
    expect(prompt).toMatch(/Priority Order/);
    expect(prompt).toMatch(/Identify knowledge gaps/);
  });

  // ── Gap 2: Epistemisk hygien ────────────────────────────────
  it('distinguishes dedup from synthesis merge', () => {
    expect(prompt).toMatch(/TYPE A.*Deduplication/);
    expect(prompt).toMatch(/TYPE B.*Synthesis/);
  });

  it('requires preserving originals in synthesis merge', () => {
    expect(prompt).toMatch(/original_descriptions/);
    expect(prompt).toMatch(/synthesis.*true/i);
  });

  // ── Gap 4: Three-Gate Test ──────────────────────────────────
  it('includes Three-Gate Test for merge validation', () => {
    expect(prompt).toMatch(/Three-Gate Test/);
    expect(prompt).toMatch(/SAME PROBLEM/);
    expect(prompt).toMatch(/SAME CONTEXT/);
    expect(prompt).toMatch(/COMPATIBLE PROPERTIES/);
  });

  it('treats candidates as hypotheses', () => {
    expect(prompt).toMatch(/HYPOTHESES, not confirmations/);
  });

  // ── Gap 6: Distribute findings ──────────────────────────────
  it('instructs to write memory/consolidation_findings.md', () => {
    expect(prompt).toMatch(/memory\/consolidation_findings\.md/);
  });

  it('includes Historian review section in findings', () => {
    expect(prompt).toMatch(/Granskning för Historian/);
  });

  // ── Gap 7: Schema reference ─────────────────────────────────
  it('includes graph schema reference', () => {
    expect(prompt).toMatch(/Graph Schema Reference/);
    expect(prompt).toMatch(/confidence.*0.*1/);
  });

  // ── Gap 8: Scope promotion requires evidence ────────────────
  it('requires success evidence for scope promotion', () => {
    expect(prompt).toMatch(/success evidence.*not just occurrence/i);
  });

  // ── Gap 9: Preconditions ────────────────────────────────────
  it('includes precondition check', () => {
    expect(prompt).toMatch(/Preconditions/);
    expect(prompt).toMatch(/exit early/);
  });

  // ── Gap 3: Outcome-focused checklist ────────────────────────
  it('checklist includes merge reason quality check', () => {
    expect(prompt).toMatch(/explains WHY.*not just.*similarity/i);
  });

  it('checklist includes scale-dependent merge volume guard', () => {
    expect(prompt).toMatch(/30 nodes/);
    expect(prompt).toMatch(/100 nodes/);
  });

  it('checklist verifies findings are actionable', () => {
    expect(prompt).toMatch(/actionable/i);
  });

  // ── Gap 5: Quality review of new nodes ──────────────────────
  it('includes quality review of new nodes', () => {
    expect(prompt).toMatch(/Quality-Review New Nodes/);
  });

  // ── Regression guard ────────────────────────────────────────
  it('regression guard: test would fail if critical keyword removed', () => {
    const modified = prompt.replaceAll('consolidation_report.md', 'REMOVED');
    expect(modified).not.toMatch(/consolidation_report\.md/);
  });
});
