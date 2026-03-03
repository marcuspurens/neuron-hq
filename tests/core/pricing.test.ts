import { describe, it, expect } from 'vitest';
import { calcCost, getModelShortName, getModelLabel, MODEL_PRICING } from '../../src/core/pricing.js';

describe('pricing', () => {
  describe('calcCost', () => {
    it('calculates cost for sonnet', () => {
      // 1M input + 0.5M output = $3 + $7.5 = $10.5
      const cost = calcCost(1_000_000, 500_000, 'sonnet');
      expect(cost).toBeCloseTo(10.5, 2);
    });

    it('calculates cost for haiku', () => {
      // 1M input + 1M output = $0.80 + $4.0 = $4.80
      const cost = calcCost(1_000_000, 1_000_000, 'haiku');
      expect(cost).toBeCloseTo(4.80, 2);
    });

    it('calculates cost for opus', () => {
      // 1M input + 0.1M output = $15 + $7.5 = $22.5
      const cost = calcCost(1_000_000, 100_000, 'opus');
      expect(cost).toBeCloseTo(22.5, 2);
    });

    it('falls back to sonnet pricing for unknown model', () => {
      const cost = calcCost(1_000_000, 0, 'unknown');
      expect(cost).toBeCloseTo(3.0, 2);
    });

    it('returns 0 for zero tokens', () => {
      expect(calcCost(0, 0, 'sonnet')).toBe(0);
    });
  });

  describe('getModelShortName', () => {
    it('maps haiku models', () => {
      expect(getModelShortName('claude-3-haiku-20240307')).toBe('haiku');
      expect(getModelShortName('claude-haiku-3')).toBe('haiku');
    });

    it('maps opus models', () => {
      expect(getModelShortName('claude-3-opus-20240229')).toBe('opus');
      expect(getModelShortName('claude-opus-4')).toBe('opus');
    });

    it('defaults to sonnet', () => {
      expect(getModelShortName('claude-sonnet-4-6')).toBe('sonnet');
      expect(getModelShortName('some-other-model')).toBe('sonnet');
    });
  });

  describe('getModelLabel', () => {
    it('returns Haiku for haiku models', () => {
      expect(getModelLabel('claude-3-haiku')).toBe('Haiku');
    });

    it('returns Opus for opus models', () => {
      expect(getModelLabel('claude-opus-4')).toBe('Opus');
    });

    it('returns Sonnet 4.5 for sonnet models', () => {
      expect(getModelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.5');
    });

    it('returns raw model name for unknown models', () => {
      expect(getModelLabel('gpt-4')).toBe('gpt-4');
    });
  });

  describe('MODEL_PRICING', () => {
    it('has entries for sonnet, haiku, opus', () => {
      expect(MODEL_PRICING).toHaveProperty('sonnet');
      expect(MODEL_PRICING).toHaveProperty('haiku');
      expect(MODEL_PRICING).toHaveProperty('opus');
    });

    it('each entry has input and output pricing', () => {
      for (const [, pricing] of Object.entries(MODEL_PRICING)) {
        expect(pricing).toHaveProperty('input');
        expect(pricing).toHaveProperty('output');
        expect(pricing.input).toBeGreaterThan(0);
        expect(pricing.output).toBeGreaterThan(0);
      }
    });
  });
});
