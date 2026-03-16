import { describe, it, expect } from 'vitest';
import { narrateEvent, isLogWorthy } from '../../src/core/narrative.js';

describe('narrative', () => {
  // =====================================================
  // narrateEvent
  // =====================================================
  describe('narrateEvent', () => {
    // 1. run:start
    it('translates run:start with target and hours', () => {
      const result = narrateEvent('run:start', { target: 'neuron-hq', hours: 1 });
      expect(result).toBe('🚀 Körning startad: neuron-hq (1 timme)');
    });

    // 2. run:end
    it('translates run:end with duration', () => {
      const result = narrateEvent('run:end', { duration: 42 });
      expect(result).toBe('🏁 Körning avslutad (42s)');
    });

    // 3. agent:start without task
    it('translates agent:start without taskId', () => {
      const result = narrateEvent('agent:start', { agent: 'manager' });
      expect(result).toBe('📋 Manager börjar arbeta');
    });

    // 4. agent:start with taskId
    it('translates agent:start with taskId and task', () => {
      const result = narrateEvent('agent:start', {
        agent: 'implementer',
        taskId: 'T1',
        task: 'Create narrative.ts',
      });
      expect(result).toBe('👷 Implementer tar uppgift T1: Create narrative.ts');
    });

    // 5. agent:end success
    it('translates agent:end success', () => {
      const result = narrateEvent('agent:end', { agent: 'reviewer' });
      expect(result).toBe('✅ Reviewer klar');
    });

    // 6. agent:end with error
    it('translates agent:end with error', () => {
      const result = narrateEvent('agent:end', {
        agent: 'implementer',
        error: 'Lint failed',
      });
      expect(result).toBe('❌ Implementer avslutad med fel: Lint failed');
    });

    // 7. agent:text returns null
    it('returns null for agent:text', () => {
      const result = narrateEvent('agent:text', { agent: 'manager', text: 'hello' });
      expect(result).toBeNull();
    });

    // 8. agent:thinking
    it('translates agent:thinking', () => {
      const result = narrateEvent('agent:thinking', { agent: 'manager', text: '...' });
      expect(result).toBe('🧠 Manager resonerar...');
    });

    // 9. iteration returns null
    it('returns null for iteration', () => {
      const result = narrateEvent('iteration', { agent: 'implementer', current: 3, max: 70 });
      expect(result).toBeNull();
    });

    // 10. task:status running
    it('translates task:status running', () => {
      const result = narrateEvent('task:status', { taskId: 'T1', status: 'running' });
      expect(result).toBe('🔄 Uppgift T1 startar');
    });

    // 11. task:status completed
    it('translates task:status completed', () => {
      const result = narrateEvent('task:status', { taskId: 'T2', status: 'completed' });
      expect(result).toBe('✅ Uppgift T2 klar');
    });

    // 12. task:status failed
    it('translates task:status failed', () => {
      const result = narrateEvent('task:status', { taskId: 'T3', status: 'failed' });
      expect(result).toBe('❌ Uppgift T3 misslyckades');
    });

    // 13. task:status pending (fallback)
    it('translates task:status pending with fallback', () => {
      const result = narrateEvent('task:status', { taskId: 'T4', status: 'pending' });
      expect(result).toBe('📌 Uppgift T4: pending');
    });

    // 14. stoplight GREEN
    it('translates stoplight GREEN', () => {
      const result = narrateEvent('stoplight', { status: 'GREEN' });
      expect(result).toBe('🟢 STOPLIGHT: GREEN — körningen godkänd');
    });

    // 15. stoplight YELLOW
    it('translates stoplight YELLOW', () => {
      const result = narrateEvent('stoplight', { status: 'YELLOW' });
      expect(result).toBe('🟡 STOPLIGHT: YELLOW — körningen delvis godkänd');
    });

    // 16. stoplight RED
    it('translates stoplight RED', () => {
      const result = narrateEvent('stoplight', { status: 'RED' });
      expect(result).toBe('🔴 STOPLIGHT: RED — körningen underkänd');
    });

    // 17. tokens returns null
    it('returns null for tokens', () => {
      const result = narrateEvent('tokens', { agent: 'manager', input: 100, output: 50 });
      expect(result).toBeNull();
    });

    // 18. time returns null
    it('returns null for time', () => {
      const result = narrateEvent('time', { elapsed: 60, remaining: 3540, percent: 1.7 });
      expect(result).toBeNull();
    });

    // 19. audit with delegation
    it('translates audit with delegation', () => {
      const result = narrateEvent('audit', {
        role: 'manager',
        target: 'implementer',
        delegation: true,
      });
      expect(result).toBe('📤 Manager → Implementer: delegering');
    });

    // 20. audit with blocked (allowed:false)
    it('translates audit with blocked', () => {
      const result = narrateEvent('audit', {
        allowed: false,
        reason: 'rm command not allowed',
      });
      expect(result).toBe('🚫 Policy blockerade: rm command not allowed');
    });

    // 21. audit other returns null
    it('returns null for generic audit event', () => {
      const result = narrateEvent('audit', { action: 'read', path: '/src/foo.ts' });
      expect(result).toBeNull();
    });

    // 24. unknown event returns fallback string
    it('returns fallback string for unknown event type', () => {
      const result = narrateEvent('custom:event', { foo: 'bar' });
      expect(result).not.toBeNull();
      expect(result).toContain('custom:event');
    });
  });

  // =====================================================
  // isLogWorthy
  // =====================================================
  describe('isLogWorthy', () => {
    // 22. returns false for non-log events
    it('returns false for tokens, time, iteration, agent:text', () => {
      expect(isLogWorthy('tokens')).toBe(false);
      expect(isLogWorthy('time')).toBe(false);
      expect(isLogWorthy('iteration')).toBe(false);
      expect(isLogWorthy('agent:text')).toBe(false);
    });

    // 23. returns true for log-worthy events
    it('returns true for run:start, agent:start, task:status, stoplight', () => {
      expect(isLogWorthy('run:start')).toBe(true);
      expect(isLogWorthy('run:end')).toBe(true);
      expect(isLogWorthy('agent:start')).toBe(true);
      expect(isLogWorthy('agent:end')).toBe(true);
      expect(isLogWorthy('agent:thinking')).toBe(true);
      expect(isLogWorthy('task:status')).toBe(true);
      expect(isLogWorthy('stoplight')).toBe(true);
      expect(isLogWorthy('audit')).toBe(true);
    });

    it('returns true for unknown event types (they are log-worthy by default)', () => {
      expect(isLogWorthy('custom:event')).toBe(true);
    });
  });

  // =====================================================
  // Edge cases
  // =====================================================
  describe('edge cases', () => {
    it('capitalizes agent names correctly', () => {
      const result = narrateEvent('agent:start', { agent: 'reviewer' });
      expect(result).toBe('📋 Reviewer börjar arbeta');
    });

    it('handles missing agent name gracefully', () => {
      const result = narrateEvent('agent:start', {});
      expect(result).toBe('📋 Unknown börjar arbeta');
    });

    it('handles audit with target but no delegation flag', () => {
      const result = narrateEvent('audit', { role: 'manager', target: 'reviewer' });
      expect(result).toBe('📤 Manager → Reviewer: delegering');
    });
  });
});
