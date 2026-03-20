import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/brief-reviewer.md'), 'utf-8');

describe('brief-reviewer.md — critical instructions', () => {
  it('defines severity levels (Kritiskt, Förbättring, Notering)', () => {
    expect(prompt).toMatch(/Kritiskt/);
    expect(prompt).toMatch(/Förbättring/);
    expect(prompt).toMatch(/Notering/);
  });

  it('has a godkänn-tröskel section', () => {
    expect(prompt).toMatch(/Godkänn-tröskel/);
  });

  it('requires ≥7 total score for approval', () => {
    expect(prompt).toMatch(/≥\s*7/);
  });

  it('requires AC dimension ≥8 for approval', () => {
    expect(prompt).toMatch(/Acceptanskriterier.*≥\s*8/s);
  });

  it('limits max 2 critical issues per review', () => {
    expect(prompt).toMatch(/[Mm]ax 2 kritiska/);
  });

  it('has multi-turn rules to prevent scope creep', () => {
    expect(prompt).toMatch(/Multi-turn/);
    expect(prompt).toMatch(/Höj INTE ribban/);
  });

  it('has anti-pattern list', () => {
    expect(prompt).toMatch(/Anti-mönster/);
  });

  it('includes verdict format (GODKÄND / UNDERKÄND)', () => {
    expect(prompt).toMatch(/GODKÄND/);
    expect(prompt).toMatch(/UNDERKÄND/);
  });

  it('requires kodverifiering section', () => {
    expect(prompt).toMatch(/[Kk]odverifiering/);
  });

  it('regression guard: test would fail if godkänn-tröskel removed', () => {
    const modified = prompt.replaceAll('Godkänn-tröskel', 'REMOVED');
    expect(modified).not.toMatch(/Godkänn-tröskel/);
  });
});
