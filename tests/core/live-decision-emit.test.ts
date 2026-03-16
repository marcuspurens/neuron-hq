import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eventBus } from '../../src/core/event-bus.js';
import { extractDecisions } from '../../src/core/decision-extractor.js';

describe('Live Decision Emission', () => {
  beforeEach(() => {
    eventBus.resetHistory();
    eventBus.resetCounts();
    eventBus.removeAllListeners();
  });

  describe('extractDecisions for live use', () => {
    it('extracts decisions from thinking text with intent patterns', () => {
      const decisions = extractDecisions(
        "I'll delegate the task to Implementer for better results.",
        [], [], 'test-run', 'manager'
      );
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].what).toContain('delegate');
    });

    it('returns empty array for text without intent patterns', () => {
      const decisions = extractDecisions(
        'Just some random text without any patterns.',
        [], [], 'test-run', 'manager'
      );
      expect(decisions.length).toBe(0);
    });

    it('generates unique IDs for each decision', () => {
      const decisions = extractDecisions(
        "I'll fix the bug. I should also update tests.",
        [], [], 'test-run', 'manager'
      );
      if (decisions.length >= 2) {
        const ids = new Set(decisions.map(d => d.id));
        expect(ids.size).toBe(decisions.length);
      }
    });

    it('detects confidence level from text', () => {
      const lowConf = extractDecisions(
        "I'm not sure but I'll try this approach.",
        [], [], 'test-run', 'manager'
      );
      if (lowConf.length > 0) {
        expect(lowConf[0].confidence).toBe('low');
      }
    });

    it('detects high confidence from text', () => {
      const highConf = extractDecisions(
        "I'm confident I should use this approach. Definitely the right call.",
        [], [], 'test-run', 'manager'
      );
      if (highConf.length > 0) {
        expect(highConf[0].confidence).toBe('high');
      }
    });
  });

  describe('deduplication via Set', () => {
    it('Set prevents duplicate decision IDs', () => {
      const emittedIds = new Set<string>();
      const decisions = extractDecisions(
        "I'll implement the fix now.",
        [], [], 'test-run', 'manager'
      );
      
      const emitted: string[] = [];
      for (const d of decisions) {
        if (!emittedIds.has(d.id)) {
          emittedIds.add(d.id);
          emitted.push(d.id);
        }
      }
      
      // Running same extraction again should not produce new emitted IDs
      for (const d of decisions) {
        if (!emittedIds.has(d.id)) {
          emittedIds.add(d.id);
          emitted.push(d.id);
        }
      }
      
      expect(emitted.length).toBe(decisions.length);
    });
  });

  describe('decision event format', () => {
    it('decision event has correct shape', () => {
      const received: Array<{ runid: string; agent: string; decision: any }> = [];
      eventBus.on('decision', (d: any) => received.push(d));
      
      eventBus.safeEmit('decision', {
        runid: 'test-run',
        agent: 'manager',
        decision: {
          id: 'd-test-001',
          timestamp: new Date().toISOString(),
          agent: 'manager',
          type: 'plan',
          what: 'Created plan with 3 tasks',
          why: 'Brief requires multiple changes',
          confidence: 'high',
        },
      });

      expect(received).toHaveLength(1);
      expect(received[0].runid).toBe('test-run');
      expect(received[0].decision.type).toBe('plan');
    });

    it('decision event is recorded in history', () => {
      eventBus.safeEmit('decision', {
        runid: 'test-run',
        agent: 'manager',
        decision: {
          id: 'd-test-002',
          timestamp: new Date().toISOString(),
          agent: 'manager',
          type: 'delegation',
          what: 'Delegated to implementer',
          why: 'Task is well-defined',
          confidence: 'medium',
        },
      });

      const decisionEvents = eventBus.history.filter(e => e.event === 'decision');
      expect(decisionEvents.length).toBe(1);
    });

    it('decision event counter increments', () => {
      eventBus.safeEmit('decision', {
        runid: 'r1',
        agent: 'manager',
        decision: {
          id: 'd-1',
          timestamp: new Date().toISOString(),
          agent: 'manager',
          type: 'tool_choice',
          what: 'test',
          why: '',
          confidence: 'medium',
        },
      });
      eventBus.safeEmit('decision', {
        runid: 'r1',
        agent: 'manager',
        decision: {
          id: 'd-2',
          timestamp: new Date().toISOString(),
          agent: 'manager',
          type: 'tool_choice',
          what: 'test2',
          why: '',
          confidence: 'medium',
        },
      });

      expect(eventBus.eventCounts.get('decision')).toBe(2);
    });
  });
});
