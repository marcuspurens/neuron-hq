import { describe, it, expect } from 'vitest';
import { detectContradictions, type RunBelief } from '../../src/core/run-statistics.js';

function makeBelief(dimension: string, confidence: number): RunBelief {
  return {
    dimension,
    confidence,
    total_runs: 10,
    successes: 5,
    last_updated: '2026-01-01T00:00:00Z',
  };
}

describe('detectContradictions', () => {
  it('no contradictions — all beliefs close', () => {
    const beliefs = [
      makeBelief('agent:a', 0.6),
      makeBelief('agent:b', 0.65),
      makeBelief('agent:c', 0.7),
    ];
    const result = detectContradictions(beliefs);
    expect(result).toHaveLength(0);
  });

  it('one contradiction within agent group', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.95),
      makeBelief('agent:researcher', 0.3),
    ];
    const result = detectContradictions(beliefs);
    expect(result).toHaveLength(1);
    expect(result[0].gap).toBeGreaterThanOrEqual(0.35);
    expect(result[0].dimension1).toBe('agent:implementer');
  });

  it('multiple groups — agents + briefs', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.95),
      makeBelief('agent:researcher', 0.3),
      makeBelief('brief:feature', 0.9),
      makeBelief('brief:test', 0.4),
    ];
    const result = detectContradictions(beliefs);
    expect(result).toHaveLength(2);
  });

  it('custom minGap', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.8),
      makeBelief('agent:researcher', 0.3),
    ];
    // gap = 0.5, default minGap 0.35 catches it
    expect(detectContradictions(beliefs)).toHaveLength(1);
    // with minGap 0.6, gap 0.5 is below threshold
    expect(detectContradictions(beliefs, { minGap: 0.6 })).toHaveLength(0);
  });

  it('empty input', () => {
    expect(detectContradictions([])).toEqual([]);
  });

  it('sorted by gap — biggest first', () => {
    const beliefs = [
      makeBelief('agent:a', 0.95),
      makeBelief('agent:b', 0.3),
      makeBelief('agent:c', 0.5),
    ];
    // a vs b gap=0.65, a vs c gap=0.45, b vs c gap=0.2 (below threshold)
    const result = detectContradictions(beliefs);
    expect(result).toHaveLength(2);
    expect(result[0].gap).toBeGreaterThan(result[1].gap);
  });

  it('cross-group dimensions NOT compared', () => {
    const beliefs = [
      makeBelief('agent:implementer', 0.95),
      makeBelief('brief:test', 0.2),
    ];
    const result = detectContradictions(beliefs);
    expect(result).toHaveLength(0);
  });

  it('target dimensions grouped separately', () => {
    const beliefs = [
      makeBelief('target:foo', 0.9),
      makeBelief('target:bar', 0.4),
    ];
    const result = detectContradictions(beliefs);
    expect(result).toHaveLength(1);
  });
});
