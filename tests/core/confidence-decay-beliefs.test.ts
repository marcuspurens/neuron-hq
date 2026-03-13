import { describe, it, expect } from 'vitest';
import { applyDecay } from '../../src/core/run-statistics.js';

describe('applyDecay (run-based beliefs)', () => {
  it('within grace period (10 runs) — confidence unchanged', () => {
    expect(applyDecay(0.9, 5)).toBe(0.9);
    expect(applyDecay(0.9, 10)).toBe(0.9);
  });

  it('after grace period — confidence moves toward 0.5', () => {
    const result = applyDecay(0.9, 20);
    expect(result).toBeLessThan(0.9);
    expect(result).toBeGreaterThan(0.5);
  });

  it('high confidence 0.95 after 20 runs past grace', () => {
    // 30 runs total - 10 grace = 20 runs of decay
    // 0.5 + (0.95 - 0.5) * Math.pow(0.98, 20) ≈ 0.8004
    const result = applyDecay(0.95, 30);
    expect(result).toBeCloseTo(0.8004, 2);
  });

  it('low confidence 0.2 drifts upward toward 0.5', () => {
    // 30 runs - 10 grace = 20 runs of decay
    // 0.5 + (0.2 - 0.5) * Math.pow(0.98, 20) ≈ 0.2997
    const result = applyDecay(0.2, 30);
    expect(result).toBeCloseTo(0.2997, 2);
  });

  it('custom options', () => {
    // gracePeriodRuns: 5, ratePerRun: 0.05 → 20 - 5 = 15 runs of decay
    // 0.5 + 0.4 * Math.pow(0.95, 15) ≈ 0.6853
    const result = applyDecay(0.9, 20, { gracePeriodRuns: 5, ratePerRun: 0.05 });
    expect(result).toBeCloseTo(0.6853, 2);
  });

  it('exact at grace boundary — no decay', () => {
    expect(applyDecay(0.9, 10)).toBe(0.9);
  });

  it('confidence at 0.5 stays at 0.5', () => {
    expect(applyDecay(0.5, 100)).toBe(0.5);
  });

  it('no decay when system idle (runsSince=0)', () => {
    expect(applyDecay(0.9, 0)).toBe(0.9);
    expect(applyDecay(0.3, 0)).toBe(0.3);
  });
});
