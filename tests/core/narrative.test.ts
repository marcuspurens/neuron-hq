import { describe, it, expect } from 'vitest';
import {
  narrateEvent,
  isLogWorthy,
  narrateDecision,
  narrateAggregatedDecision,
  automationBiasWarning,
  narrateDecisionSimple,
} from '../../src/core/narrative.js';
import type { Decision } from '../../src/core/decision-extractor.js';

/** Helper to create a minimal Decision for testing. */
function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'd-test-001',
    timestamp: '2026-03-16T12:00:00Z',
    agent: 'manager',
    type: 'plan',
    what: 'Delade briefen i 6 uppgifter',
    why: 'Briefen har 3 oberoende delar',
    confidence: 'high',
    ...overrides,
  };
}

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

    // Decision event tests
    it('translates decision event with decision object', () => {
      const decision = makeDecision();
      const result = narrateEvent('decision', { decision });
      expect(result).toBe('✅ Manager Delade briefen i 6 uppgifter (säkert beslut) — Briefen har 3 oberoende delar');
    });

    it('returns fallback for decision event without decision object', () => {
      const result = narrateEvent('decision', {});
      expect(result).toBe('📊 Beslut fattat');
    });

    it('returns fallback for decision event with non-object decision', () => {
      const result = narrateEvent('decision', { decision: 'not an object' });
      expect(result).toBe('📊 Beslut fattat');
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

  // =====================================================
  // narrateDecision
  // =====================================================
  describe('narrateDecision', () => {
    it('narrates high confidence decision with emoji and suffix', () => {
      const d = makeDecision({ confidence: 'high' });
      expect(narrateDecision(d)).toBe(
        '✅ Manager Delade briefen i 6 uppgifter (säkert beslut) — Briefen har 3 oberoende delar',
      );
    });

    it('narrates medium confidence decision', () => {
      const d = makeDecision({ confidence: 'medium', why: 'Briefen är tvetydig' });
      expect(narrateDecision(d)).toBe(
        '⚠️ Manager Delade briefen i 6 uppgifter (viss osäkerhet) — Briefen är tvetydig',
      );
    });

    it('narrates low confidence decision', () => {
      const d = makeDecision({ confidence: 'low', why: 'Ingen liknande uppgift' });
      expect(narrateDecision(d)).toBe(
        '🔴 Manager Delade briefen i 6 uppgifter (osäkert beslut) — Ingen liknande uppgift',
      );
    });

    it('omits why suffix when why is empty string', () => {
      const d = makeDecision({ confidence: 'high', why: '' });
      expect(narrateDecision(d)).toBe(
        '✅ Manager Delade briefen i 6 uppgifter (säkert beslut)',
      );
    });

    it('capitalizes agent name', () => {
      const d = makeDecision({ agent: 'implementer', confidence: 'high', why: '' });
      expect(narrateDecision(d)).toContain('Implementer');
    });

    it('handles unknown agent name gracefully', () => {
      const d = makeDecision({ agent: '', confidence: 'medium', why: '' });
      expect(narrateDecision(d)).toContain('Unknown');
    });
  });

  // =====================================================
  // automationBiasWarning
  // =====================================================
  describe('automationBiasWarning', () => {
    it('warns when low confidence and non-pending outcome', () => {
      const d = makeDecision({ confidence: 'low', outcome: 'success' });
      expect(automationBiasWarning(d)).toBe('OBS: Agenten agerade trots låg säkerhet');
    });

    it('warns when low confidence and failure outcome', () => {
      const d = makeDecision({ confidence: 'low', outcome: 'failure' });
      expect(automationBiasWarning(d)).toBe('OBS: Agenten agerade trots låg säkerhet');
    });

    it('does not warn when low confidence and pending outcome', () => {
      const d = makeDecision({ confidence: 'low', outcome: 'pending', type: 'delegation' });
      // pending means the agent hasn't acted yet, so no bias warning for this rule
      expect(automationBiasWarning(d)).toBeNull();
    });

    it('does not warn when low confidence and no outcome', () => {
      const d = makeDecision({ confidence: 'low', outcome: undefined });
      // No outcome set — the first check requires outcome && outcome !== 'pending'
      // Falls through to other checks. type is 'plan' and has no alternatives by default
      // but why is set, so only the plan check fires
      expect(automationBiasWarning(d)).toBe(
        '⚠️ Inga alternativ övervägdes för detta planeringsbeslut',
      );
    });

    it('warns for fix type without why', () => {
      const d = makeDecision({ type: 'fix', why: '', confidence: 'high' });
      expect(automationBiasWarning(d)).toBe('OBS: Agenten ändrade strategi utan förklaring');
    });

    it('does not warn for fix type with why', () => {
      const d = makeDecision({ type: 'fix', why: 'Lint failed', confidence: 'high' });
      expect(automationBiasWarning(d)).toBeNull();
    });

    it('warns for plan type without alternatives', () => {
      const d = makeDecision({
        type: 'plan',
        confidence: 'high',
        alternatives: undefined,
      });
      expect(automationBiasWarning(d)).toBe(
        '⚠️ Inga alternativ övervägdes för detta planeringsbeslut',
      );
    });

    it('warns for plan type with empty alternatives array', () => {
      const d = makeDecision({
        type: 'plan',
        confidence: 'high',
        alternatives: [],
      });
      expect(automationBiasWarning(d)).toBe(
        '⚠️ Inga alternativ övervägdes för detta planeringsbeslut',
      );
    });

    it('does not warn for plan type with alternatives', () => {
      const d = makeDecision({
        type: 'plan',
        confidence: 'high',
        alternatives: ['Could run sequentially'],
      });
      expect(automationBiasWarning(d)).toBeNull();
    });

    it('returns null for delegation with high confidence', () => {
      const d = makeDecision({
        type: 'delegation',
        confidence: 'high',
        alternatives: ['alt'],
      });
      expect(automationBiasWarning(d)).toBeNull();
    });

    it('low confidence takes priority over fix-without-why', () => {
      const d = makeDecision({
        type: 'fix',
        confidence: 'low',
        why: '',
        outcome: 'failure',
      });
      // low confidence + non-pending outcome is checked first
      expect(automationBiasWarning(d)).toBe('OBS: Agenten agerade trots låg säkerhet');
    });
  });

  // =====================================================
  // narrateDecisionSimple
  // =====================================================
  describe('narrateDecisionSimple', () => {
    it('returns simplified high confidence message', () => {
      const d = makeDecision({ confidence: 'high', what: 'Delegerar T1' });
      expect(narrateDecisionSimple(d)).toBe('Agenten Delegerar T1 (lyckas oftast)');
    });

    it('returns simplified medium confidence message', () => {
      const d = makeDecision({ confidence: 'medium', what: 'Kör tester' });
      expect(narrateDecisionSimple(d)).toBe('Agenten Kör tester (går oftast bra)');
    });

    it('returns simplified low confidence message', () => {
      const d = makeDecision({ confidence: 'low', what: 'Försöker fixa' });
      expect(narrateDecisionSimple(d)).toBe(
        'Agenten Försöker fixa (osäkert — kan misslyckas)',
      );
    });

    it('truncates long what to 60 chars', () => {
      const longWhat = 'A'.repeat(80);
      const d = makeDecision({ confidence: 'high', what: longWhat });
      const result = narrateDecisionSimple(d);
      // Truncated what = 57 chars + '...' = 60 chars
      expect(result).toContain('A'.repeat(57) + '...');
      expect(result).toContain('(lyckas oftast)');
    });

    it('does not truncate what at exactly 60 chars', () => {
      const exactWhat = 'B'.repeat(60);
      const d = makeDecision({ confidence: 'medium', what: exactWhat });
      const result = narrateDecisionSimple(d);
      expect(result).toContain(exactWhat);
      expect(result).not.toContain('...');
    });

    it('does not truncate what under 60 chars', () => {
      const shortWhat = 'C'.repeat(30);
      const d = makeDecision({ confidence: 'low', what: shortWhat });
      const result = narrateDecisionSimple(d);
      expect(result).toContain(shortWhat);
      expect(result).not.toContain('...');
    });
  });

  // =====================================================
  // RT-3 additional tests: narrateDecision edge cases
  // =====================================================
  describe('narrateDecision — RT-3 edge cases', () => {
    it('narrates delegation type decision', () => {
      const d = makeDecision({
        type: 'delegation',
        agent: 'manager',
        what: 'Delegerade till implementer',
        confidence: 'high',
        why: 'T1 är redo',
      });
      const result = narrateDecision(d);
      expect(result).toBe('✅ Manager Delegerade till implementer (säkert beslut) — T1 är redo');
    });

    it('narrates escalation type with low confidence', () => {
      const d = makeDecision({
        type: 'escalation',
        agent: 'implementer',
        what: 'Eskalerade till manager',
        confidence: 'low',
        why: 'Tester misslyckas upprepat',
      });
      const result = narrateDecision(d);
      expect(result).toContain('🔴');
      expect(result).toContain('Implementer');
      expect(result).toContain('osäkert beslut');
      expect(result).toContain('Tester misslyckas upprepat');
    });

    it('handles review type with medium confidence', () => {
      const d = makeDecision({
        type: 'review',
        agent: 'reviewer',
        what: 'Godkände ändringen',
        confidence: 'medium',
        why: '',
      });
      const result = narrateDecision(d);
      expect(result).toBe('⚠️ Reviewer Godkände ändringen (viss osäkerhet)');
    });

    it('handles special characters in what field', () => {
      const d = makeDecision({
        what: 'Skapade src/core/field-of-view.ts (ny fil)',
        confidence: 'high',
        why: '',
      });
      const result = narrateDecision(d);
      expect(result).toContain('field-of-view.ts');
      expect(result).toContain('(ny fil)');
    });
  });

  // =====================================================
  // RT-3 additional tests: automationBiasWarning edge cases
  // =====================================================
  describe('automationBiasWarning — RT-3 edge cases', () => {
    it('returns null for high confidence with alternatives', () => {
      const d = makeDecision({
        confidence: 'high',
        type: 'plan',
        alternatives: ['Alt A', 'Alt B'],
        why: 'Good reason',
      });
      expect(automationBiasWarning(d)).toBeNull();
    });

    it('returns null for plan with alternatives array', () => {
      const d = makeDecision({
        confidence: 'medium',
        type: 'plan',
        alternatives: ['Use different approach'],
        why: 'Some reason',
      });
      expect(automationBiasWarning(d)).toBeNull();
    });

    it('warns on low confidence with partial outcome', () => {
      const d = makeDecision({
        confidence: 'low',
        outcome: 'partial',
        type: 'tool_choice',
      });
      const result = automationBiasWarning(d);
      expect(result).toBe('OBS: Agenten agerade trots låg säkerhet');
    });

    it('returns null for medium confidence delegation with why', () => {
      const d = makeDecision({
        confidence: 'medium',
        type: 'delegation',
        why: 'Agent ready for task',
      });
      expect(automationBiasWarning(d)).toBeNull();
    });
  });

  // =====================================================
  // RT-3 additional tests: narrateDecisionSimple edge cases
  // =====================================================
  describe('narrateDecisionSimple — RT-3 edge cases', () => {
    it('handles empty what string', () => {
      const d = makeDecision({ confidence: 'high', what: '' });
      const result = narrateDecisionSimple(d);
      expect(result).toBe('Agenten  (lyckas oftast)');
    });

    it('handles what at exactly 59 chars without truncation', () => {
      const what59 = 'D'.repeat(59);
      const d = makeDecision({ confidence: 'medium', what: what59 });
      const result = narrateDecisionSimple(d);
      expect(result).toContain(what59);
      expect(result).not.toContain('...');
    });

    it('truncates what at 61 chars', () => {
      const what61 = 'E'.repeat(61);
      const d = makeDecision({ confidence: 'low', what: what61 });
      const result = narrateDecisionSimple(d);
      expect(result).toContain('...');
      expect(result).toContain('osäkert');
    });
  });

  // =====================================================
  // RT-3 additional tests: narrateEvent with decision variants
  // =====================================================
  describe('narrateEvent decision — RT-3 variants', () => {
    it('handles decision event with low confidence', () => {
      const d = makeDecision({ confidence: 'low', why: 'Oklart' });
      const result = narrateEvent('decision', { decision: d });
      expect(result).toContain('🔴');
      expect(result).toContain('osäkert beslut');
    });

    it('handles decision event with medium confidence and no why', () => {
      const d = makeDecision({ confidence: 'medium', why: '' });
      const result = narrateEvent('decision', { decision: d });
      expect(result).toBe('⚠️ Manager Delade briefen i 6 uppgifter (viss osäkerhet)');
    });
  });

  // =====================================================
  // RT-3 additional: isLogWorthy for decision event
  // =====================================================
  describe('isLogWorthy — RT-3 decision event', () => {
    it('returns true for decision event type', () => {
      expect(isLogWorthy('decision')).toBe(true);
    });
  });

  // =====================================================
  // narrateAggregatedDecision
  // =====================================================
  describe('narrateAggregatedDecision', () => {
    it('returns chart emoji for aggregated decision with körde/åtgärder', () => {
      const d = makeDecision({ what: 'Implementer körde 5 åtgärder' });
      const result = narrateAggregatedDecision(d);
      expect(result).toContain('\uD83D\uDCCA');
      expect(result).toContain('körde 5 åtgärder');
    });

    it('falls back to narrateDecision for non-aggregated decisions', () => {
      const d = makeDecision({ what: 'Delade briefen i 6 uppgifter', confidence: 'high' });
      const result = narrateAggregatedDecision(d);
      expect(result).toBe(narrateDecision(d));
    });

    it('falls back when only körde is present without åtgärder', () => {
      const d = makeDecision({ what: 'Agent körde ett test' });
      const result = narrateAggregatedDecision(d);
      expect(result).toBe(narrateDecision(d));
    });
  });

});
