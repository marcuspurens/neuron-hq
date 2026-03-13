import { describe, it, expect } from 'vitest';
import {
  applyDecay,
  detectContradictions,
  type Contradiction,
  type RunBelief,
} from '../../src/core/run-statistics.js';

// ---------------------------------------------------------------------------
// applyDecay
// ---------------------------------------------------------------------------

describe('applyDecay', () => {
  it('returns original confidence within grace period (default 14 days)', () => {
    expect(applyDecay(0.8, 0)).toBe(0.8);
    expect(applyDecay(0.8, 7)).toBe(0.8);
    expect(applyDecay(0.8, 14)).toBe(0.8);
  });

  it('decays confidence toward 0.5 after grace period', () => {
    const result = applyDecay(0.8, 24); // 10 days past grace
    expect(result).toBeLessThan(0.8);
    expect(result).toBeGreaterThan(0.5);
  });

  it('decays low confidence upward toward 0.5', () => {
    const result = applyDecay(0.2, 24); // 10 days past grace
    expect(result).toBeGreaterThan(0.2);
    expect(result).toBeLessThan(0.5);
  });

  it('returns 0.5 when fully decayed (very old)', () => {
    const result = applyDecay(0.9, 1000);
    expect(result).toBeCloseTo(0.5, 1);
  });

  it('respects custom grace period', () => {
    // Within custom grace of 30 days
    expect(applyDecay(0.8, 20, { gracePeriodDays: 30 })).toBe(0.8);
    // Beyond custom grace of 30 days
    const result = applyDecay(0.8, 40, { gracePeriodDays: 30 });
    expect(result).toBeLessThan(0.8);
  });

  it('respects custom daily rate', () => {
    const slow = applyDecay(0.8, 24, { dailyRate: 0.001 });
    const fast = applyDecay(0.8, 24, { dailyRate: 0.1 });
    // Slow decay should be closer to original
    expect(slow).toBeGreaterThan(fast);
  });

  it('rounds to 4 decimal places', () => {
    const result = applyDecay(0.8, 15);
    const decimals = result.toString().split('.')[1] || '';
    expect(decimals.length).toBeLessThanOrEqual(4);
  });

  it('confidence at 0.5 stays at 0.5 regardless of decay', () => {
    expect(applyDecay(0.5, 100)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// detectContradictions
// ---------------------------------------------------------------------------

function makeBelief(dimension: string, confidence: number): RunBelief {
  return {
    dimension,
    confidence,
    total_runs: 10,
    successes: Math.round(confidence * 10),
    last_updated: new Date().toISOString(),
  };
}

describe('detectContradictions', () => {
  it('detects contradictions within agent group', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.9),
      makeBelief('agent:reviewer', 0.4),
    ];
    const contradictions = detectContradictions(beliefs);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].dimension1).toBe('agent:implementer');
    expect(contradictions[0].dimension2).toBe('agent:reviewer');
    expect(contradictions[0].gap).toBe(0.5);
  });

  it('detects contradictions within brief group', () => {
    const beliefs = [
      makeBelief('brief:feature', 0.85),
      makeBelief('brief:bugfix', 0.4),
    ];
    const contradictions = detectContradictions(beliefs);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].gap).toBe(0.45);
  });

  it('detects contradictions within model group', () => {
    const beliefs = [
      makeBelief('model:gpt-4', 0.9),
      makeBelief('model:gpt-3.5', 0.3),
    ];
    const contradictions = detectContradictions(beliefs);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].gap).toBe(0.6);
  });

  it('does NOT compare across groups', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.9),
      makeBelief('brief:bugfix', 0.2),
    ];
    const contradictions = detectContradictions(beliefs);
    expect(contradictions).toHaveLength(0);
  });

  it('ignores gaps below minGap threshold', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.7),
      makeBelief('agent:reviewer', 0.6),
    ];
    const contradictions = detectContradictions(beliefs);
    expect(contradictions).toHaveLength(0);
  });

  it('respects custom minGap', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.7),
      makeBelief('agent:reviewer', 0.6),
    ];
    const contradictions = detectContradictions(beliefs, { minGap: 0.05 });
    expect(contradictions).toHaveLength(1);
  });

  it('returns empty array for empty beliefs', () => {
    expect(detectContradictions([])).toEqual([]);
  });

  it('returns empty array for single belief', () => {
    expect(detectContradictions([makeBelief('agent:x', 0.9)])).toEqual([]);
  });

  it('sorts contradictions by gap descending', () => {
    const beliefs = [
      makeBelief('agent:a', 0.95),
      makeBelief('agent:b', 0.1),
      makeBelief('agent:c', 0.5),
    ];
    const contradictions = detectContradictions(beliefs);
    // a vs b = 0.85, a vs c = 0.45, b vs c = 0.4
    expect(contradictions.length).toBe(3);
    expect(contradictions[0].gap).toBe(0.85);
    expect(contradictions[1].gap).toBe(0.45);
    expect(contradictions[2].gap).toBe(0.4);
  });

  it('description format is correct', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.9),
      makeBelief('agent:reviewer', 0.4),
    ];
    const c = detectContradictions(beliefs)[0];
    expect(c.description).toContain('agent:implementer (0.9)');
    expect(c.description).toContain('agent:reviewer (0.4)');
    expect(c.description).toContain('gap 0.50');
  });
});
