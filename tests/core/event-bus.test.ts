import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eventBus, NeuronEventBus, type EventMap } from '../../src/core/event-bus.js';

// Reset state before each test to avoid cross-contamination
beforeEach(() => {
  eventBus.removeAllListeners();
  eventBus.resetHistory();
  eventBus.resetCounts();
});

// =====================================================
// 1. Singleton tests
// =====================================================
describe('Singleton', () => {
  it('eventBus is an instance of NeuronEventBus', () => {
    expect(eventBus).toBeInstanceOf(NeuronEventBus);
  });

  it('importing twice returns the same instance', async () => {
    const { eventBus: secondImport } = await import('../../src/core/event-bus.js');
    expect(secondImport).toBe(eventBus);
  });
});

// =====================================================
// 2. safeEmit tests
// =====================================================
describe('safeEmit', () => {
  it('emits to registered listeners correctly', () => {
    const received: EventMap['run:start'][] = [];
    eventBus.on('run:start', (data: EventMap['run:start']) => {
      received.push(data);
    });

    const payload: EventMap['run:start'] = {
      runid: 'r1',
      target: 'my-app',
      hours: 2,
      startTime: '2026-03-16T10:00:00Z',
    };
    eventBus.safeEmit('run:start', payload);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(payload);
  });

  it('works fine with no listeners (no throw)', () => {
    expect(() => {
      eventBus.safeEmit('run:end', { runid: 'r1', duration: 100 });
    }).not.toThrow();
  });

  it('catches listener errors silently (console.error called, no exception)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    eventBus.on('run:start', () => {
      throw new Error('boom');
    });

    expect(() => {
      eventBus.safeEmit('run:start', {
        runid: 'r1',
        target: 'app',
        hours: 1,
        startTime: '2026-01-01T00:00:00Z',
      });
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// =====================================================
// 3. History buffer tests
// =====================================================
describe('History buffer', () => {
  it('records events with event name, data, and timestamp', () => {
    const data: EventMap['run:start'] = {
      runid: 'r1',
      target: 'app',
      hours: 1,
      startTime: '2026-01-01T00:00:00Z',
    };
    eventBus.safeEmit('run:start', data);

    expect(eventBus.history).toHaveLength(1);
    const entry = eventBus.history[0];
    expect(entry.event).toBe('run:start');
    expect(entry.data).toEqual(data);
    expect(typeof entry.timestamp).toBe('string');
    // Timestamp should be a valid ISO string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('is circular — oldest events removed when > 200', () => {
    for (let i = 0; i < 210; i++) {
      eventBus.safeEmit('tokens', {
        runid: `r-${i}`,
        agent: 'test',
        input: i,
        output: i,
      });
    }

    expect(eventBus.history).toHaveLength(200);
    // The oldest entry should be r-10 (0..9 were evicted)
    const first = eventBus.history[0].data as EventMap['tokens'];
    expect(first.runid).toBe('r-10');
  });

  it('resetHistory() clears the buffer', () => {
    eventBus.safeEmit('run:end', { runid: 'r1', duration: 5 });
    expect(eventBus.history).toHaveLength(1);

    eventBus.resetHistory();
    expect(eventBus.history).toHaveLength(0);
  });
});

// =====================================================
// 4. Event type tests
// =====================================================
describe('Event types', () => {
  it('run:start event has correct shape', () => {
    const received: unknown[] = [];
    eventBus.on('run:start', (d: EventMap['run:start']) => received.push(d));

    eventBus.safeEmit('run:start', {
      runid: 'r1',
      target: 'proj',
      hours: 3,
      startTime: '2026-03-16T10:00:00Z',
    });

    expect(received).toHaveLength(1);
    const d = received[0] as EventMap['run:start'];
    expect(d).toHaveProperty('runid', 'r1');
    expect(d).toHaveProperty('target', 'proj');
    expect(d).toHaveProperty('hours', 3);
    expect(d).toHaveProperty('startTime', '2026-03-16T10:00:00Z');
  });

  it('task:status with status enum values works', () => {
    const statuses: EventMap['task:status']['status'][] = [
      'pending',
      'running',
      'completed',
      'failed',
    ];

    for (const status of statuses) {
      const received: EventMap['task:status'][] = [];
      eventBus.on('task:status', (d: EventMap['task:status']) => received.push(d));

      eventBus.safeEmit('task:status', {
        runid: 'r1',
        taskId: 'T1',
        status,
      });

      expect(received.at(-1)?.status).toBe(status);
      eventBus.removeAllListeners('task:status');
    }
  });

  it('tokens event with numeric values', () => {
    const received: EventMap['tokens'][] = [];
    eventBus.on('tokens', (d: EventMap['tokens']) => received.push(d));

    eventBus.safeEmit('tokens', {
      runid: 'r1',
      agent: 'implementer',
      input: 1500,
      output: 800,
    });

    expect(received).toHaveLength(1);
    expect(received[0].input).toBe(1500);
    expect(received[0].output).toBe(800);
    expect(typeof received[0].input).toBe('number');
    expect(typeof received[0].output).toBe('number');
  });
});

// =====================================================
// 5. onAny wildcard tests
// =====================================================
describe('onAny wildcard', () => {
  it('onAny callback receives all events', () => {
    const collected: Array<{ event: string; data: unknown }> = [];
    eventBus.onAny((event, data) => {
      collected.push({ event, data });
    });

    eventBus.safeEmit('run:start', {
      runid: 'r1',
      target: 'app',
      hours: 1,
      startTime: '2026-01-01T00:00:00Z',
    });
    eventBus.safeEmit('run:end', { runid: 'r1', duration: 42 });

    expect(collected).toHaveLength(2);
    expect(collected[0].event).toBe('run:start');
    expect(collected[1].event).toBe('run:end');
  });

  it('removeOnAny removes the callback', () => {
    const collected: string[] = [];
    const cb = (event: string): void => {
      collected.push(event);
    };

    eventBus.onAny(cb);
    eventBus.safeEmit('run:end', { runid: 'r1', duration: 1 });
    expect(collected).toHaveLength(1);

    eventBus.removeOnAny(cb);
    eventBus.safeEmit('run:end', { runid: 'r1', duration: 2 });
    expect(collected).toHaveLength(1); // still 1, not called again
  });
});

// =====================================================
// 6. Event counters tests
// =====================================================
describe('Event counters', () => {
  it('eventCounts increments per event type', () => {
    eventBus.safeEmit('run:start', {
      runid: 'r1',
      target: 'a',
      hours: 1,
      startTime: '2026-01-01T00:00:00Z',
    });
    eventBus.safeEmit('run:start', {
      runid: 'r2',
      target: 'b',
      hours: 2,
      startTime: '2026-01-02T00:00:00Z',
    });
    eventBus.safeEmit('run:end', { runid: 'r1', duration: 10 });

    expect(eventBus.eventCounts.get('run:start')).toBe(2);
    expect(eventBus.eventCounts.get('run:end')).toBe(1);
  });

  it('resetCounts() clears counters', () => {
    eventBus.safeEmit('tokens', { runid: 'r1', agent: 'a', input: 1, output: 2 });
    expect(eventBus.eventCounts.get('tokens')).toBe(1);

    eventBus.resetCounts();
    expect(eventBus.eventCounts.size).toBe(0);
    expect(eventBus.eventCounts.get('tokens')).toBeUndefined();
  });
});

// =====================================================
// 7. Isolation tests
// =====================================================
describe('Isolation', () => {
  it('if onAny callback throws, other listeners still get called and no exception propagates', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const results: string[] = [];

    // First onAny: throws
    eventBus.onAny(() => {
      throw new Error('bad callback');
    });

    // Second onAny: should still be called
    eventBus.onAny((event) => {
      results.push(event);
    });

    expect(() => {
      eventBus.safeEmit('run:end', { runid: 'r1', duration: 99 });
    }).not.toThrow();

    expect(results).toHaveLength(1);
    expect(results[0]).toBe('run:end');
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

// =====================================================
// 8. task:plan event type tests
// =====================================================
describe('task:plan event', () => {
  it('emits task:plan with tasks array', () => {
    const received: EventMap['task:plan'][] = [];
    eventBus.on('task:plan', (d: EventMap['task:plan']) => received.push(d));

    eventBus.safeEmit('task:plan', {
      runid: 'r1',
      tasks: [
        { id: 'T1', description: 'Fix the widget' },
        { id: 'T2', description: 'Add tests' },
      ],
    });

    expect(received).toHaveLength(1);
    expect(received[0].tasks).toHaveLength(2);
    expect(received[0].tasks[0].id).toBe('T1');
    expect(received[0].tasks[0].description).toBe('Fix the widget');
  });

  it('task:status accepts optional description and agent fields', () => {
    const received: EventMap['task:status'][] = [];
    eventBus.on('task:status', (d: EventMap['task:status']) => received.push(d));

    eventBus.safeEmit('task:status', {
      runid: 'r1',
      taskId: 'T1',
      status: 'running',
      description: 'Fix the widget',
      agent: 'implementer',
      branch: 'task-T1',
    });

    expect(received).toHaveLength(1);
    expect(received[0].description).toBe('Fix the widget');
    expect(received[0].agent).toBe('implementer');
  });
});

// =====================================================
// 9. brief event type tests
// =====================================================
describe('brief event', () => {
  it('emits brief with all required fields', () => {
    const received: EventMap['brief'][] = [];
    eventBus.on('brief', (d: EventMap['brief']) => received.push(d));

    eventBus.safeEmit('brief', {
      runid: 'r1',
      title: 'My Task Brief',
      summary: 'This is the summary of the brief.',
      fullContent: '# My Task Brief\n\nThis is the summary of the brief.\n\n## Details\n\nMore info here.',
    });

    expect(received).toHaveLength(1);
    expect(received[0].runid).toBe('r1');
    expect(received[0].title).toBe('My Task Brief');
    expect(received[0].summary).toBe('This is the summary of the brief.');
    expect(received[0].fullContent).toContain('# My Task Brief');
  });

  it('records brief event in history', () => {
    eventBus.safeEmit('brief', {
      runid: 'r1',
      title: 'Test Brief',
      summary: 'Summary text',
      fullContent: '# Test Brief\n\nSummary text',
    });

    expect(eventBus.history).toHaveLength(1);
    expect(eventBus.history[0].event).toBe('brief');
    const data = eventBus.history[0].data as EventMap['brief'];
    expect(data.title).toBe('Test Brief');
  });

  it('increments event counter for brief', () => {
    eventBus.safeEmit('brief', {
      runid: 'r1',
      title: 'B1',
      summary: 'S1',
      fullContent: 'C1',
    });
    eventBus.safeEmit('brief', {
      runid: 'r2',
      title: 'B2',
      summary: 'S2',
      fullContent: 'C2',
    });

    expect(eventBus.eventCounts.get('brief')).toBe(2);
  });
});
