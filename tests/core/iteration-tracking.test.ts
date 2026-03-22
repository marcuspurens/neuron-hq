import { describe, it, expect } from 'vitest';
import { UsageTracker } from '../../src/core/usage.js';

describe('Iteration tracking in UsageTracker', () => {
  it('recordIterations writes iterations_used and iterations_limit to by_agent', () => {
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');
    tracker.recordTokens('manager', 100, 50);
    tracker.recordIterations('manager', 23, 70);

    const usage = tracker.getUsage();
    expect(usage.by_agent.manager).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      iterations_used: 23,
      iterations_limit: 70,
    });
  });

  it('recordIterations creates by_agent entry if it does not exist', () => {
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');
    tracker.recordIterations('implementer', 41, 50);

    const usage = tracker.getUsage();
    expect(usage.by_agent.implementer).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      iterations_used: 41,
      iterations_limit: 50,
    });
  });

  it('recordIterations overwrites on repeated calls for the same agent', () => {
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');
    tracker.recordIterations('reviewer', 10, 50);
    tracker.recordIterations('reviewer', 25, 50);

    const usage = tracker.getUsage();
    expect(usage.by_agent.reviewer.iterations_used).toBe(25);
    expect(usage.by_agent.reviewer.iterations_limit).toBe(50);
  });

  it('recordIterations does not affect token counts', () => {
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');
    tracker.recordTokens('tester', 500, 200);
    tracker.recordIterations('tester', 5, 30);

    const usage = tracker.getUsage();
    expect(usage.by_agent.tester.input_tokens).toBe(500);
    expect(usage.by_agent.tester.output_tokens).toBe(200);
    expect(usage.by_agent.tester.iterations_used).toBe(5);
    expect(usage.by_agent.tester.iterations_limit).toBe(30);
  });

  it('by_agent without iterations still passes schema (optional fields)', () => {
    const tracker = new UsageTracker('20240101-0000-test', 'test-model');
    tracker.recordTokens('manager', 100, 50);

    const usage = tracker.getUsage();
    expect(usage.by_agent.manager.iterations_used).toBeUndefined();
    expect(usage.by_agent.manager.iterations_limit).toBeUndefined();
  });
});
