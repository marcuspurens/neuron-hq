import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/knowledge-manager.md'), 'utf-8');

describe('knowledge-manager.md — critical instructions', () => {
  it('defines four phases: PRECONDITIONS, SCAN, RESEARCH, REPORT', () => {
    expect(prompt).toMatch(/PRECONDITIONS/);
    expect(prompt).toMatch(/SCAN/);
    expect(prompt).toMatch(/RESEARCH/);
    expect(prompt).toMatch(/REPORT/);
  });

  it('mentions maxActions limit', () => {
    expect(prompt).toMatch(/maxActions/);
  });

  it('mentions Aurora tools', () => {
    expect(prompt).toMatch(/gaps/);
    expect(prompt).toMatch(/freshness/);
    expect(prompt).toMatch(/remember/);
    expect(prompt).toMatch(/suggest-research/);
  });

  it('mentions KMReport output format with honest resolution statuses', () => {
    expect(prompt).toMatch(/KMReport/);
    expect(prompt).toMatch(/gapsFound/);
    expect(prompt).toMatch(/gapsResearched/);
    expect(prompt).toMatch(/gapsResolved/);
    expect(prompt).toMatch(/gapsPartiallyResolved/);
    expect(prompt).toMatch(/gapsUnresolved/);
    expect(prompt).toMatch(/sourcesVerified/);
    expect(prompt).toMatch(/sourcesFlaggedForReview/);
    expect(prompt).toMatch(/newNodesCreated/);
    expect(prompt).toMatch(/duplicatesAvoided/);
  });

  it('focuses on knowledge maintenance, not coding', () => {
    expect(prompt).toMatch(/NOT.*coding/i);
  });

  // --- Interview gap coverage (S119) ---

  it('gap 1: addresses prompt-code divergence with Implementation Note', () => {
    expect(prompt).toMatch(/Implementation Note/);
    expect(prompt).toMatch(/deterministic TypeScript pipeline/i);
    expect(prompt).toMatch(/requires judgment/i);
  });

  it('gap 2: honest resolution statuses instead of binary resolved', () => {
    expect(prompt).toMatch(/resolved/);
    expect(prompt).toMatch(/partially_resolved/);
    expect(prompt).toMatch(/unverified/);
    expect(prompt).toMatch(/unresolved/);
    expect(prompt).toMatch(/no_sources_found/);
  });

  it('gap 3: search before remember is explicit', () => {
    expect(prompt).toMatch(/always.*search.*before.*remember/i);
  });

  it('gap 4: chaining only from genuinely resolved gaps', () => {
    expect(prompt).toMatch(/genuinely resolved/i);
    expect(prompt).toMatch(/Do not chain from gaps with status/);
  });

  it('gap 5: defined consumers section', () => {
    expect(prompt).toMatch(/Defined Consumers/);
    expect(prompt).toMatch(/memory\/km_health\.md/);
    expect(prompt).toMatch(/memory\/km_history\.md/);
    expect(prompt).toMatch(/For Historian/);
  });

  it('gap 6: verify-source requires actual content check', () => {
    expect(prompt).toMatch(/Only call after actually checking accuracy/);
    expect(prompt).toMatch(/Do not call.*verify-source.*if you cannot assess/i);
  });

  it('gap 7: maxActions counting clarified', () => {
    expect(prompt).toMatch(/Each research candidate.*counts as one action/);
  });

  it('gap 8: preconditions check prevents redundant runs', () => {
    expect(prompt).toMatch(/Phase 0.*PRECONDITIONS/);
    expect(prompt).toMatch(/km_history/);
    expect(prompt).toMatch(/exit early/i);
  });

  it('gap 9: self-reflection checklist is outcome-focused', () => {
    expect(prompt).toMatch(/Self-Reflection Checklist/);
    expect(prompt).toMatch(/verified relevant content/);
    expect(prompt).toMatch(/honest/i);
  });

  it('gap 10: topic scoping leak addressed', () => {
    expect(prompt).toMatch(/Do not ingest full documents when.*focusTopic.*is set/);
  });

  it('has priority order section', () => {
    expect(prompt).toMatch(/Priority Order/);
  });

  it('mentions two queues: research and archive', () => {
    expect(prompt).toMatch(/Research queue/i);
    expect(prompt).toMatch(/Archive queue/i);
  });

  it('mentions chaining configuration parameters', () => {
    expect(prompt).toMatch(/chain/);
    expect(prompt).toMatch(/maxCycles/);
    expect(prompt).toMatch(/convergenceThreshold/);
    expect(prompt).toMatch(/maxTimeMinutes/);
  });

  it('has honesty principle as core obligation', () => {
    expect(prompt).toMatch(/honesty over completeness/i);
  });
});
