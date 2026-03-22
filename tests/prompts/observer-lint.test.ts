import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const prompt = readFileSync(join(__dirname, '../../prompts/observer.md'), 'utf-8');

describe('observer.md — critical instructions', () => {
  it('defines the observer role clearly', () => {
    expect(prompt).toMatch(/Observer/i);
    expect(prompt).toMatch(/Neuron HQ/i);
  });

  it('requires honesty-over-performativity principle', () => {
    // Must contain the honesty principle — either in Swedish or as a pattern
    expect(prompt).toMatch(/[Ää]rlighet|honesty/i);
  });

  it('requires evidence-over-assumptions principle', () => {
    expect(prompt).toMatch(/[Bb]evis|evidence/i);
    expect(prompt).toMatch(/faktisk|actual data|tool/i);
  });

  it('requires recommend-not-change principle', () => {
    // Observer must never modify — only observe
    expect(prompt).toMatch(/[Rr]ekommendera|[Rr]ecommend/i);
    expect(prompt).toMatch(/aldrig [äa]ndra|never modify/i);
  });

  it('includes PROMPT-FIX output category', () => {
    expect(prompt).toMatch(/PROMPT-FIX/);
  });

  it('includes CODE-FIX output category', () => {
    expect(prompt).toMatch(/CODE-FIX/);
  });

  it('includes OK output category', () => {
    expect(prompt).toMatch(/\bOK\b/);
  });

  it('all three output categories are present together', () => {
    expect(prompt).toMatch(/PROMPT-FIX/);
    expect(prompt).toMatch(/CODE-FIX/);
    expect(prompt).toMatch(/\bOK\b/);
  });

  it('regression guard: test would fail if PROMPT-FIX removed', () => {
    const modified = prompt.replaceAll('PROMPT-FIX', 'REMOVED');
    expect(modified).not.toMatch(/PROMPT-FIX/);
  });

  it('regression guard: test would fail if CODE-FIX removed', () => {
    const modified = prompt.replaceAll('CODE-FIX', 'REMOVED');
    expect(modified).not.toMatch(/CODE-FIX/);
  });

  it('prompt is non-trivial (at least 200 chars)', () => {
    expect(prompt.length).toBeGreaterThanOrEqual(200);
  });
});
