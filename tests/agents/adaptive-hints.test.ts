import { describe, it, expect } from 'vitest';
import { generateAdaptiveHints } from '../../src/core/agents/adaptive-hints.js';
import { type RunBelief, type BriefType } from '../../src/core/run-statistics.js';

function makeBelief(
  dimension: string,
  confidence: number,
  total_runs = 10,
  successes = 5,
): RunBelief {
  return {
    dimension,
    confidence,
    total_runs,
    successes,
    last_updated: '2025-01-01T00:00:00Z',
  };
}

describe('generateAdaptiveHints', () => {
  it('returns empty result for empty beliefs', () => {
    const result = generateAdaptiveHints([], 'feature');
    expect(result).toEqual({ promptSection: '', warnings: [], strengths: [], contradictions: [] });
  });

  it('generates agent:researcher warning when confidence < 0.5', () => {
    const beliefs = [makeBelief('agent:researcher', 0.3)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].dimension).toBe('agent:researcher');
    expect(result.warnings[0].suggestion).toContain('Researcher has low success rate (0.3)');
    expect(result.warnings[0].suggestion).toContain('very specific topics');
  });

  it('generates agent:consolidator warning when confidence < 0.5', () => {
    const beliefs = [makeBelief('agent:consolidator', 0.2)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].suggestion).toContain('Consolidator has low success rate (0.2)');
  });

  it('generates generic agent warning for unknown agent', () => {
    const beliefs = [makeBelief('agent:foobar', 0.1)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].suggestion).toContain('Agent foobar has below-average confidence (0.1)');
  });

  it('does NOT generate warning when confidence is exactly 0.5', () => {
    const beliefs = [makeBelief('agent:researcher', 0.5)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(0);
  });

  it('generates brief:feature warning only when briefType matches', () => {
    const beliefs = [makeBelief('brief:feature', 0.45)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].suggestion).toContain('Feature briefs have historically been challenging');
  });

  it('does NOT generate brief:feature warning when briefType is different', () => {
    const beliefs = [makeBelief('brief:feature', 0.45)];
    const result = generateAdaptiveHints(beliefs, 'bugfix');
    expect(result.warnings).toHaveLength(0);
  });

  it('generates brief:test warning when briefType is test', () => {
    const beliefs = [makeBelief('brief:test', 0.3)];
    const result = generateAdaptiveHints(beliefs, 'test');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].suggestion).toContain('Test briefs sometimes fail');
  });

  it('generates generic brief warning for unknown brief type', () => {
    const beliefs = [makeBelief('brief:infrastructure', 0.4)];
    const result = generateAdaptiveHints(beliefs, 'infrastructure');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].suggestion).toContain("Brief type 'infrastructure' has low historical confidence (0.4)");
  });

  it('does NOT add strength when confidence is exactly 0.85', () => {
    const beliefs = [makeBelief('agent:implementer', 0.85)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.strengths).toHaveLength(0);
  });

  it('adds strength when confidence > 0.85', () => {
    const beliefs = [makeBelief('agent:implementer', 0.9)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.strengths).toHaveLength(1);
    expect(result.strengths[0]).toBe('agent:implementer (0.9)');
  });

  it('computes correct general stats in promptSection', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.7, 10, 8),
      makeBelief('agent:reviewer', 0.6, 5, 3),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.promptSection).toContain('2 tracked dimensions');
    expect(result.promptSection).toContain('15 observations');
    expect(result.promptSection).toContain('11 successes');
    expect(result.promptSection).toContain('4 non-successes');
  });

  it('includes Adaptive Performance Hints header', () => {
    const beliefs = [makeBelief('agent:implementer', 0.7)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.promptSection).toContain('## Adaptive Performance Hints');
  });

  it('includes warnings section when there are warnings', () => {
    const beliefs = [makeBelief('agent:researcher', 0.3)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.promptSection).toContain('### ⚠️ Warnings');
    expect(result.promptSection).toContain('- Consider whether external research (arxiv) is truly needed');
  });

  it('includes strengths section when there are strengths', () => {
    const beliefs = [makeBelief('agent:implementer', 0.95)];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.promptSection).toContain('### ✅ Strengths');
    expect(result.promptSection).toContain('- agent:implementer (0.95)');
  });

  it('handles mixed warnings and strengths', () => {
    const beliefs = [
      makeBelief('agent:researcher', 0.2),
      makeBelief('agent:implementer', 0.95),
      makeBelief('brief:feature', 0.4),
      makeBelief('agent:reviewer', 0.6), // neither warning nor strength
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.warnings).toHaveLength(2); // researcher + brief:feature
    expect(result.strengths).toHaveLength(1); // implementer
  });

  it('detects contradictions and includes them in result', () => {
    const beliefs = [
      makeBelief('agent:researcher', 0.2),
      makeBelief('agent:implementer', 0.95),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0].dimension1).toBe('agent:implementer');
    expect(result.contradictions[0].dimension2).toBe('agent:researcher');
    expect(result.contradictions[0].gap).toBeGreaterThanOrEqual(0.35);
    expect(result.promptSection).toContain('### ⚡ Contradictions');
  });

  it('returns empty contradictions when no significant gaps exist', () => {
    const beliefs = [
      makeBelief('agent:researcher', 0.6),
      makeBelief('agent:implementer', 0.7),
    ];
    const result = generateAdaptiveHints(beliefs, 'feature');
    expect(result.contradictions).toHaveLength(0);
    expect(result.promptSection).not.toContain('### ⚡ Contradictions');
  });
});
