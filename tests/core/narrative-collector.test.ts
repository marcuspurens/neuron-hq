import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventBus } from '../../src/core/event-bus.js';
import { NarrativeCollector } from '../../src/core/narrative-collector.js';

let collector: NarrativeCollector;

// Reset EventBus state before each test
beforeEach(() => {
  eventBus.removeAllListeners();
  eventBus.resetHistory();
  eventBus.resetCounts();
  collector = new NarrativeCollector();
});

afterEach(() => {
  collector.stop();
});

// =====================================================
// 1. Collects agent:start events
// =====================================================
describe('NarrativeCollector', () => {
  it('collects agent:start events as action type', () => {
    collector.start('test-run');

    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'implementer',
      task: 'Fix bug',
      taskId: 'T1',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('action');
    expect(entries[0].agent).toBe('implementer');
    expect(entries[0].summary).toContain('Implementer');
    expect(typeof entries[0].ts).toBe('string');
  });

  // =====================================================
  // 2. Collects agent:end events
  // =====================================================
  it('collects agent:end events as action type', () => {
    collector.start('test-run');

    eventBus.safeEmit('agent:end', {
      runid: 'test-run',
      agent: 'reviewer',
      result: 'MERGE',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('action');
    expect(entries[0].agent).toBe('reviewer');
  });

  // =====================================================
  // 3. Collects decision events with summary
  // =====================================================
  it('collects decision events with summary and decisionRef', () => {
    collector.start('test-run');

    eventBus.safeEmit('decision', {
      runid: 'test',
      agent: 'manager',
      decision: {
        id: 'D1',
        timestamp: new Date().toISOString(),
        agent: 'manager',
        type: 'plan',
        what: 'Created plan',
        why: 'Needed structure',
        confidence: 'high',
      },
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('decision');
    expect(entries[0].decisionRef).toBe('D1');
    expect(entries[0].agent).toBe('manager');
    expect(typeof entries[0].summary).toBe('string');
    expect(entries[0].summary.length).toBeGreaterThan(0);
  });

  // =====================================================
  // 4. Filters audit events - only allowed:true with note
  // =====================================================
  it('filters audit events - only allowed:true with note included', () => {
    collector.start('test-run');

    // 1) allowed: false → should be excluded
    eventBus.safeEmit('audit', {
      allowed: false,
      role: 'implementer',
      tool: 'bash_exec',
      reason: 'Policy blocked',
    });

    // 2) allowed: true but no note/files_touched → should be excluded
    eventBus.safeEmit('audit', {
      allowed: true,
      role: 'manager',
      delegation: true,
      target: 'implementer',
    });

    // 3) allowed: true with note → should be included
    eventBus.safeEmit('audit', {
      ts: new Date().toISOString(),
      role: 'implementer',
      tool: 'bash_exec',
      allowed: true,
      note: 'Running tests',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].agent).toBe('implementer');
    expect(entries[0].type).toBe('action');
  });

  // =====================================================
  // 5. getEntries returns chronological order
  // =====================================================
  it('getEntries returns chronological order', async () => {
    collector.start('test-run');

    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'manager',
    });
    await new Promise((r) => setTimeout(r, 5));

    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'implementer',
    });
    await new Promise((r) => setTimeout(r, 5));

    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'reviewer',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].agent).toBe('manager');
    expect(entries[1].agent).toBe('implementer');
    expect(entries[2].agent).toBe('reviewer');

    // Verify timestamps are in chronological order
    for (let i = 1; i < entries.length; i++) {
      expect(new Date(entries[i].ts).getTime()).toBeGreaterThanOrEqual(
        new Date(entries[i - 1].ts).getTime(),
      );
    }
  });

  // =====================================================
  // 6. getEntriesByAgent filters correctly
  // =====================================================
  it('getEntriesByAgent filters correctly', () => {
    collector.start('test-run');

    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'manager',
    });
    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'implementer',
    });
    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'manager',
    });

    const managerEntries = collector.getEntriesByAgent('manager');
    expect(managerEntries).toHaveLength(2);
    expect(managerEntries.every((e) => e.agent === 'manager')).toBe(true);

    const implEntries = collector.getEntriesByAgent('implementer');
    expect(implEntries).toHaveLength(1);
    expect(implEntries[0].agent).toBe('implementer');

    expect(collector.getEntriesByAgent('nonexistent')).toEqual([]);
  });

  // =====================================================
  // 7. Max 500 entries - overflow drops oldest
  // =====================================================
  it('max 500 entries - overflow drops oldest', () => {
    collector.start('test-run');

    // Emit 505 events
    for (let i = 0; i < 505; i++) {
      eventBus.safeEmit('agent:start', {
        runid: 'test-run',
        agent: `agent-${i}`,
      });
    }

    const entries = collector.getEntries();
    expect(entries).toHaveLength(500);
    // Oldest 5 entries (agent-0 through agent-4) should be evicted
    expect(entries[0].agent).toBe('agent-5');
    expect(entries[499].agent).toBe('agent-504');
  });

  // =====================================================
  // 8. Truncates detail field to 200 chars
  // =====================================================
  it('truncates detail field to 200 chars', () => {
    collector.start('test-run');

    const longMessage = 'A'.repeat(300);
    eventBus.safeEmit('warning', {
      runid: 'test-run',
      type: 'merge_failed',
      message: longMessage,
      agent: 'merger',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].detail).toBeDefined();
    expect(entries[0].detail!.length).toBeLessThanOrEqual(200);
    expect(entries[0].detail!.endsWith('...')).toBe(true);
  });

  // =====================================================
  // 9. Start/stop lifecycle - unregisters listeners
  // =====================================================
  it('start/stop lifecycle - unregisters listeners', () => {
    const listenersBefore = eventBus.listenerCount('agent:start');

    collector.start('test-run');

    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'manager',
    });
    expect(collector.getEntries()).toHaveLength(1);

    // Verify listener was added
    expect(eventBus.listenerCount('agent:start')).toBe(listenersBefore + 1);

    collector.stop();

    // Verify listener was removed
    expect(eventBus.listenerCount('agent:start')).toBe(listenersBefore);

    // Events after stop should not be captured
    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'implementer',
    });
    expect(collector.getEntries()).toHaveLength(1);
  });

  // =====================================================
  // 10. Events after stop are ignored
  // =====================================================
  it('events after stop are ignored', () => {
    collector.start('test-run');
    collector.stop();

    eventBus.safeEmit('agent:start', {
      runid: 'test-run',
      agent: 'manager',
    });
    eventBus.safeEmit('warning', {
      runid: 'test-run',
      type: 'max_iterations',
      message: 'Nearing limit',
      agent: 'implementer',
    });

    expect(collector.getEntries()).toHaveLength(0);
  });

  // =====================================================
  // 11. Empty run returns empty list
  // =====================================================
  it('empty run returns empty list', () => {
    collector.start('test-run');
    collector.stop();

    expect(collector.getEntries()).toEqual([]);
  });

  // =====================================================
  // 12. Warning events included
  // =====================================================
  it('warning events included with type warning', () => {
    collector.start('test-run');

    eventBus.safeEmit('warning', {
      runid: 'test',
      type: 'max_iterations',
      message: 'Nearing limit',
      agent: 'manager',
    });

    const entries = collector.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('warning');
    expect(entries[0].agent).toBe('manager');
    expect(typeof entries[0].summary).toBe('string');
  });
});
