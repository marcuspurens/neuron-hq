import { describe, it, expect } from 'vitest';
import { applyDecay } from '../../src/core/run-statistics.js';

describe('applyDecay (run beliefs)', () => {
  it('within grace period — confidence unchanged', () => {
    expect(applyDecay(0.9, 10)).toBe(0.9);
  });

  it('after grace period — confidence moves toward 0.5', () => {
    const result = applyDecay(0.9, 30);
    expect(result).toBeLessThan(0.9);
    expect(result).toBeGreaterThan(0.5);
  });

  it('high confidence 0.95 after 30 days decay', () => {
    // 44 days total - 14 grace = 30 days of decay
    // 0.5 + (0.95 - 0.5) * Math.pow(0.99, 30) ≈ 0.8329
    const result = applyDecay(0.95, 44);
    expect(result).toBeCloseTo(0.8327, 2);
  });

  it('low confidence 0.2 drifts upward toward 0.5', () => {
    // 44 days total - 14 grace = 30 days of decay
    // 0.5 + (0.2 - 0.5) * Math.pow(0.99, 30) ≈ 0.2781
    const result = applyDecay(0.2, 44);
    expect(result).toBeCloseTo(0.2782, 2);
  });

  it('custom options', () => {
    // gracePeriodDays: 5, dailyRate: 0.05 → 20 - 5 = 15 days of decay
    // 0.5 + 0.4 * Math.pow(0.95, 15) ≈ 0.6853
    const result = applyDecay(0.9, 20, { gracePeriodDays: 5, dailyRate: 0.05 });
    expect(result).toBeCloseTo(0.6853, 2);
  });

  it('exact at grace boundary — no decay', () => {
    expect(applyDecay(0.9, 14)).toBe(0.9);
  });

  it('confidence at 0.5 stays at 0.5', () => {
    expect(applyDecay(0.5, 100)).toBe(0.5);
  });
});
