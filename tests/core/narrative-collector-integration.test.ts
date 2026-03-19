import { describe, it, expect, afterEach } from 'vitest';
import { NarrativeCollector } from '../../src/core/narrative-collector.js';
import { eventBus } from '../../src/core/event-bus.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let collector: NarrativeCollector | null = null;

afterEach(() => {
  if (collector) {
    collector.stop();
    collector = null;
  }
  eventBus.removeAllListeners();
  eventBus.resetHistory();
  eventBus.resetCounts();
});

// =====================================================
// 1. Collector subscribes to EventBus and captures events end-to-end
// =====================================================
describe('end-to-end event capture', () => {
  it('captures agent:start, decision, and agent:end events via real EventBus', async () => {
    collector = new NarrativeCollector();
    collector.start('integration-test');

    // run:start is NOT in the collector subscription list — should not be captured
    eventBus.safeEmit('run:start', {
      runid: 'integration-test',
      target: 'test-target',
      hours: 1,
      startTime: new Date().toISOString(),
    });
    await delay(5);

    eventBus.safeEmit('agent:start', {
      runid: 'integration-test',
      agent: 'manager',
      task: 'Plan tasks',
      taskId: 'T1',
    });
    await delay(5);

    eventBus.safeEmit('decision', {
      runid: 'integration-test',
      agent: 'manager',
      decision: {
        id: 'd-int-001',
        timestamp: new Date().toISOString(),
        agent: 'manager',
        type: 'plan',
        what: 'Created plan with 3 tasks',
        why: 'Brief requires multiple changes',
        confidence: 'high',
      },
    });
    await delay(5);

    eventBus.safeEmit('agent:end', {
      runid: 'integration-test',
      agent: 'manager',
      result: 'DONE',
    });

    const entries = collector.getEntries();
    // run:start should NOT be captured → 3 entries total
    expect(entries).toHaveLength(3);
    expect(entries[0].type).toBe('action');    // agent:start
    expect(entries[1].type).toBe('decision');  // decision
    expect(entries[2].type).toBe('action');    // agent:end
  });
});

// =====================================================
// 2. Multiple agents - entries sorted chronologically
// =====================================================
describe('chronological ordering with multiple agents', () => {
  it('entries are ordered chronologically across multiple agents', async () => {
    collector = new NarrativeCollector();
    collector.start('integration-test');

    eventBus.safeEmit('agent:start', {
      runid: 'integration-test',
      agent: 'researcher',
    });
    await delay(5);

    eventBus.safeEmit('agent:start', {
      runid: 'integration-test',
      agent: 'implementer',
    });
    await delay(5);

    eventBus.safeEmit('agent:end', {
      runid: 'integration-test',
      agent: 'researcher',
    });
    await delay(5);

    eventBus.safeEmit('agent:end', {
      runid: 'integration-test',
      agent: 'implementer',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(4);

    // Verify chronological order by checking agent sequence
    expect(entries[0].agent).toBe('researcher');  // agent:start researcher
    expect(entries[1].agent).toBe('implementer'); // agent:start implementer
    expect(entries[2].agent).toBe('researcher');  // agent:end researcher
    expect(entries[3].agent).toBe('implementer'); // agent:end implementer

    // Verify timestamps are non-decreasing
    for (let i = 1; i < entries.length; i++) {
      expect(new Date(entries[i].ts).getTime()).toBeGreaterThanOrEqual(
        new Date(entries[i - 1].ts).getTime(),
      );
    }
  });
});

// =====================================================
// 3. Decision events linked to correct agent
// =====================================================
describe('decision events linked to correct agent', () => {
  it('decision entry has correct agent field and decisionRef', async () => {
    collector = new NarrativeCollector();
    collector.start('integration-test');

    eventBus.safeEmit('decision', {
      runid: 'integration-test',
      agent: 'manager',
      decision: {
        id: 'd-int-mgr-001',
        timestamp: new Date().toISOString(),
        agent: 'manager',
        type: 'plan',
        what: 'Split brief into 4 tasks',
        why: 'Parallel execution possible',
        confidence: 'high',
      },
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].agent).toBe('manager');
    expect(entries[0].decisionRef).toBe('d-int-mgr-001');
    expect(entries[0].type).toBe('decision');
  });
});

// =====================================================
// 4. Stoplight event included as status entry
// =====================================================
describe('stoplight event as status entry', () => {
  it('stoplight event is captured with type status', async () => {
    collector = new NarrativeCollector();
    collector.start('integration-test');

    eventBus.safeEmit('stoplight', {
      runid: 'integration-test',
      status: 'GREEN',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('status');
    expect(entries[0].summary).toContain('GREEN');
  });
});
