import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/historian.md'), 'utf-8');

describe('Historian prompt — interview-driven improvements (S116)', () => {
  describe('artifact verification (intent vs outcome)', () => {
    it('states the general principle: audit logs intent, not outcome', () => {
      expect(prompt).toMatch(/audit\.jsonl loggar intent, inte outcome/);
    });

    it('lists explicit verification for Merger artifacts', () => {
      expect(prompt).toMatch(/Merger.*merge_summary\.md/);
    });

    it('lists explicit verification for Librarian artifacts', () => {
      expect(prompt).toMatch(/Librarian.*ideas\.md/);
    });

    it('lists explicit verification for Implementer artifacts', () => {
      expect(prompt).toMatch(/Implementer.*implementer_handoff\.md/);
    });

    it('instructs to report missing artifacts as warning, not success', () => {
      expect(prompt).toContain('inte som framgång');
    });
  });

  describe('retrospective self-check (step 2)', () => {
    it('includes a quick check of the previous run entry', () => {
      expect(prompt).toMatch(/Snabbkontroll av föregående körning/);
    });

    it('limits the check to max 1 iteration', () => {
      expect(prompt).toMatch(/max 1 iteration/);
    });

    it('instructs to add a correction footnote if needed', () => {
      expect(prompt).toMatch(/Korrigering \(körning/);
    });
  });

  describe('false-positive protection in error deduplication', () => {
    it('states the asymmetry: prefer duplicates over false closures', () => {
      expect(prompt).toMatch(/hellre dubblett än falsk/);
    });

    it('requires same root cause before closing', () => {
      expect(prompt).toMatch(/Samma rotorsak/);
    });

    it('requires the solution was actually applied', () => {
      expect(prompt).toMatch(/Lösningen tillämpades/);
    });

    it('requires the problem did not recur', () => {
      expect(prompt).toMatch(/Problemet uteblev/);
    });
  });

  describe('contextual decay in skeptic review', () => {
    it('asks whether the pattern was relevant for this run', () => {
      expect(prompt).toMatch(/Var mönstret relevant för denna körning/);
    });

    it('leaves confidence unchanged when pattern is irrelevant', () => {
      expect(prompt).toMatch(/lämna confidence oförändrad/);
    });

    it('states the principle: absence of relevance ≠ absence of validity', () => {
      expect(prompt).toMatch(/Avsaknad av relevans är inte.*avsaknad av giltighet/s);
    });
  });

  describe('pattern deprecation in patterns.md', () => {
    it('syncs patterns.md status when graph confidence drops below 0.4', () => {
      expect(prompt).toMatch(/confidence under 0\.4/);
    });

    it('marks pattern as inactive when confidence drops below 0.2', () => {
      expect(prompt).toMatch(/confidence.*under 0\.2/);
    });

    it('includes status markers for deprecated patterns', () => {
      expect(prompt).toMatch(/❌ Inaktuell/);
    });
  });

  describe('priority order for limited iterations', () => {
    it('includes the priority section', () => {
      expect(prompt).toMatch(/Prioritetsordning vid begränsade iterationer/);
    });

    it('always requires run summary as top priority', () => {
      expect(prompt).toMatch(/Alltid.*Körningssammanfattning/s);
    });

    it('always requires error entries as second priority', () => {
      expect(prompt).toMatch(/Alltid.*Error-poster/s);
    });

    it('states the core principle: never sacrifice summary for metrics', () => {
      expect(prompt).toMatch(/Skriv aldrig en ofullständig körningssammanfattning/);
    });
  });
});
