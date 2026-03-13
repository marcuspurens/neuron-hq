import { describe, it, expect } from 'vitest';
import { generateAdaptiveHints, type AdaptiveHints } from '../../../src/core/agents/adaptive-hints.js';
import { type RunBelief, type BriefType } from '../../../src/core/run-statistics.js';

function makeBelief(dimension: string, confidence: number, totalRuns = 10, successes = 5): RunBelief {
  return { dimension, confidence, total_runs: totalRuns, successes, last_updated: '2026-01-01T00:00:00Z' };
}

describe('generateAdaptiveHints', () => {
  it('returns empty results for empty beliefs array', () => {
    const result = generateAdaptiveHints([], 'feature');
    expect(result.promptSection).toBe('');
    expect(result.warnings).toEqual([]);
    expect(result.strengths).toEqual([]);
  });

  it('returns no warnings and only strengths when all beliefs are high (>0.85)', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.94, 20, 18),
      makeBelief('agent:reviewer', 0.90, 15, 14),
      makeBelief('brief:feature', 0.88, 10, 9),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(0);
    expect(result.strengths).toHaveLength(3);
    expect(result.strengths).toContain('agent:implementer (0.94)');
  });

  it('warns about researcher with low success rate', () => {
    const beliefs = [makeBelief('agent:researcher', 0.40, 10, 4)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].dimension).toBe('agent:researcher');
    expect(result.warnings[0].confidence).toBe(0.40);
    expect(result.warnings[0].suggestion).toContain('Researcher has low success rate (0.4)');
    expect(result.warnings[0].suggestion).toContain('very specific search queries');
  });

  it('warns about consolidator with low success rate', () => {
    const beliefs = [makeBelief('agent:consolidator', 0.35, 10, 3)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].dimension).toBe('agent:consolidator');
    expect(result.warnings[0].confidence).toBe(0.35);
    expect(result.warnings[0].suggestion).toContain('Consolidator has low success rate (0.35)');
    expect(result.warnings[0].suggestion).toContain('knowledge graph truly needs');
  });

  it('warns about feature briefs when briefType matches', () => {
    const beliefs = [makeBelief('brief:feature', 0.45, 10, 4)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].dimension).toBe('brief:feature');
    expect(result.warnings[0].suggestion).toContain('Feature briefs have historically been challenging');
  });

  it('reports correct counts of warnings and strengths for mixed beliefs', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.94, 20, 18),  // strength
      makeBelief('agent:reviewer', 0.90, 15, 14),      // strength
      makeBelief('agent:researcher', 0.40, 10, 4),     // warning
      makeBelief('agent:consolidator', 0.35, 10, 3),   // warning
      makeBelief('brief:feature', 0.60, 10, 6),        // neither
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(2);
    expect(result.strengths).toHaveLength(2);
  });

  it('generates warning when briefType matches the brief dimension', () => {
    const beliefs = [makeBelief('brief:feature', 0.45, 10, 4)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].suggestion).toContain('Feature briefs have historically been challenging');
  });

  it('does NOT generate warning when briefType does not match brief dimension', () => {
    const beliefs = [makeBelief('brief:feature', 0.45, 10, 4)];
    const result = generateAdaptiveHints(beliefs, 'refactor');
    expect(result.warnings).toHaveLength(0);
  });

  it('does NOT warn when confidence is exactly 0.5 (boundary)', () => {
    const beliefs = [makeBelief('agent:researcher', 0.5, 10, 5)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(0);
  });

  it('does NOT list strength when confidence is exactly 0.85 (boundary)', () => {
    const beliefs = [makeBelief('agent:implementer', 0.85, 20, 17)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.strengths).toHaveLength(0);
  });

  it('includes general stats line in promptSection', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.94, 20, 18),
      makeBelief('agent:reviewer', 0.70, 15, 10),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.promptSection).toContain('Based on 2 tracked dimensions across 35 observations');
  });

  // --- Contradiction tests ---

  it('detects contradictions in hints when agent beliefs have large gap', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.95, 20, 19),
      makeBelief('agent:researcher', 0.3, 10, 3),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].dimension1).toBe('agent:implementer');
    expect(result.contradictions[0].dimension2).toBe('agent:researcher');
    expect(result.contradictions[0].gap).toBeGreaterThanOrEqual(0.35);
    expect(result.promptSection).toContain('Contradictions');
  });

  it('shows max 3 contradictions in prompt section', () => {
    const beliefs = [
      makeBelief('agent:a', 0.95, 10, 9),
      makeBelief('agent:b', 0.1, 10, 1),
      makeBelief('agent:c', 0.15, 10, 1),
      makeBelief('agent:d', 0.2, 10, 2),
      makeBelief('agent:e', 0.25, 10, 2),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    // With these values, agent:a vs each of b/c/d/e all have gap >= 0.35
    // That's at least 4 contradictions, but prompt should show max 3
    expect(result.contradictions.length).toBeGreaterThan(3);
    expect(result.promptSection).toContain('Contradictions');

    // Count lines with ' — gap' pattern after the Contradictions header
    const contradictionsSection = result.promptSection.split('Contradictions')[1] ?? '';
    const gapLines = contradictionsSection.split('\n').filter(line => line.includes(' — gap'));
    expect(gapLines.length).toBeLessThanOrEqual(3);
  });

  it('returns empty contradictions array when beliefs have no divergence', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.70, 10, 7),
      makeBelief('agent:reviewer', 0.72, 10, 7),
      makeBelief('agent:researcher', 0.68, 10, 7),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.contradictions).toEqual([]);
    expect(result.promptSection).not.toContain('Contradictions');
  });

  it('returns empty contradictions for empty beliefs', () => {
    const result = generateAdaptiveHints([], 'feature');
    expect(result.contradictions).toEqual([]);
  });
});
