import { describe, it, expect } from 'vitest';
import {
  narrateAuditEvent,
  stripWorkspacePath,
  narrateEvent,
} from '../../src/core/narrative.js';
import type { AuditNarration } from '../../src/core/narrative.js';

describe('stripWorkspacePath', () => {
  it('strips everything up to and including /neuron-hq/', () => {
    expect(stripWorkspacePath('/Users/x/workspaces/123/neuron-hq/src/core/foo.ts'))
      .toBe('src/core/foo.ts');
  });

  it('returns original path if no /neuron-hq/ found', () => {
    expect(stripWorkspacePath('/tmp/some/other/path.ts'))
      .toBe('/tmp/some/other/path.ts');
  });

  it('handles path with multiple /neuron-hq/ segments (uses last)', () => {
    expect(stripWorkspacePath('/neuron-hq/workspaces/neuron-hq/src/test.ts'))
      .toBe('src/test.ts');
  });

  it('handles path that is just /neuron-hq/', () => {
    expect(stripWorkspacePath('/neuron-hq/')).toBe('');
  });

  it('handles empty string', () => {
    expect(stripWorkspacePath('')).toBe('');
  });
});

describe('narrateAuditEvent', () => {
  // =========================================================
  // read_file
  // =========================================================
  describe('read_file', () => {
    it('narrates read_file with display_files', () => {
      const result = narrateAuditEvent({
        tool: 'read_file',
        role: 'implementer',
        ts: '2026-03-16T12:00:00Z',
        display_files: ['src/core/foo.ts'],
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('📖 Implementer läser foo.ts');
      expect(result!.level2.fil).toBe('src/core/foo.ts');
      expect(result!.level2.agent).toBe('Implementer');
      expect(result!.level2.tid).toBe('12:00:00');
    });

    it('falls back to files_touched when display_files missing', () => {
      const result = narrateAuditEvent({
        tool: 'read_file',
        role: 'reviewer',
        ts: '2026-03-16T14:30:45Z',
        files_touched: ['/Users/x/workspaces/123/neuron-hq/src/core/bar.ts'],
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('📖 Reviewer läser bar.ts');
      expect(result!.level2.fil).toBe('src/core/bar.ts');
    });

    it('handles missing files gracefully', () => {
      const result = narrateAuditEvent({
        tool: 'read_file',
        role: 'manager',
        ts: '2026-03-16T12:00:00Z',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toContain('okänd fil');
    });
  });

  // =========================================================
  // write_file
  // =========================================================
  describe('write_file', () => {
    it('narrates write_file with diff_stats', () => {
      const result = narrateAuditEvent({
        tool: 'write_file',
        role: 'implementer',
        display_files: ['src/core/narrative.ts'],
        diff_stats: { additions: 42, deletions: 5 },
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('✏️ Implementer skriver narrative.ts (+42 rader)');
      expect(result!.level2.diff_stats).toBe('+42, -5');
    });

    it('handles missing diff_stats', () => {
      const result = narrateAuditEvent({
        tool: 'write_file',
        role: 'implementer',
        display_files: ['src/test.ts'],
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('✏️ Implementer skriver test.ts (+0 rader)');
    });
  });

  // =========================================================
  // bash_exec
  // =========================================================
  describe('bash_exec', () => {
    it('narrates bash_exec with display_command', () => {
      const result = narrateAuditEvent({
        tool: 'bash_exec',
        role: 'implementer',
        display_command: 'npm test',
        exit_code: 0,
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('⚡ Implementer kör: npm test');
      expect(result!.level2.kommando).toBe('npm test');
      expect(result!.level2.exit_code).toBe('0');
    });

    it('truncates long commands to 60 chars in level1', () => {
      const longCmd = 'a'.repeat(80);
      const result = narrateAuditEvent({
        tool: 'bash_exec',
        role: 'reviewer',
        display_command: longCmd,
      });
      expect(result!.level1.length).toBeLessThan(100); // agent + emoji + truncated
      expect(result!.level2.kommando).toBe(longCmd); // full in level2
    });

    it('falls back to note when display_command missing', () => {
      const result = narrateAuditEvent({
        tool: 'bash_exec',
        role: 'implementer',
        note: 'git status',
        exit_code: 1,
      });
      expect(result!.level1).toBe('⚡ Implementer kör: git status');
      expect(result!.level2.exit_code).toBe('1');
    });

    it('handles missing exit_code', () => {
      const result = narrateAuditEvent({
        tool: 'bash_exec',
        role: 'implementer',
        display_command: 'ls',
      });
      expect(result!.level2.exit_code).toBe('okänd');
    });
  });

  // =========================================================
  // graph_query
  // =========================================================
  describe('graph_query', () => {
    it('narrates graph_query', () => {
      const result = narrateAuditEvent({
        tool: 'graph_query',
        role: 'researcher',
        note: 'TypeScript patterns',
        count: 5,
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('🔍 Researcher söker i kunskapsgrafen');
      expect(result!.level2.sökfråga).toBe('TypeScript patterns');
      expect(result!.level2.antal).toBe('5');
    });
  });

  // =========================================================
  // search_memory
  // =========================================================
  describe('search_memory', () => {
    it('narrates search_memory with query', () => {
      const result = narrateAuditEvent({
        tool: 'search_memory',
        role: 'manager',
        note: 'previous run failures',
        count: 3,
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('🧠 Manager söker minnet: "previous run failures"');
      expect(result!.level2.sökterm).toBe('previous run failures');
    });

    it('truncates long query in level1', () => {
      const longQuery = 'q'.repeat(80);
      const result = narrateAuditEvent({
        tool: 'search_memory',
        role: 'manager',
        note: longQuery,
      });
      expect(result!.level1).toContain('...');
      expect(result!.level2.sökterm).toBe(longQuery);
    });
  });

  // =========================================================
  // write_task_plan
  // =========================================================
  describe('write_task_plan', () => {
    it('narrates write_task_plan with task_count', () => {
      const result = narrateAuditEvent({
        tool: 'write_task_plan',
        role: 'manager',
        task_count: 6,
        note: 'T1: Implement, T2: Test, T3: Review, T4: Deploy, T5: Monitor, T6: Docs',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('📋 Manager skapar plan med 6 uppgifter');
    });

    it('parses task count from note when task_count missing', () => {
      const result = narrateAuditEvent({
        tool: 'write_task_plan',
        role: 'manager',
        note: 'Created plan with 4 tasks',
      });
      expect(result!.level1).toBe('📋 Manager skapar plan med 4 uppgifter');
    });
  });

  // =========================================================
  // delegate_parallel_wave
  // =========================================================
  describe('delegate_parallel_wave', () => {
    it('narrates parallel wave', () => {
      const result = narrateAuditEvent({
        tool: 'delegate_parallel_wave',
        role: 'manager',
        wave: 2,
        note: 'T1, T2, T3',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('🌊 Manager startar Wave 2: T1, T2, T3');
    });
  });

  // =========================================================
  // delegate_to_*
  // =========================================================
  describe('delegate_to_*', () => {
    it('narrates delegate_to_implementer', () => {
      const result = narrateAuditEvent({
        tool: 'delegate_to_implementer',
        role: 'manager',
        note: 'Implement the narrative module with all audit types',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('📤 Manager → Implementer: "Implement the narrative module with all audit types"');
      expect(result!.level2['fullständig beskrivning']).toBe('Implement the narrative module with all audit types');
    });

    it('truncates long description in level1', () => {
      const longDesc = 'd'.repeat(80);
      const result = narrateAuditEvent({
        tool: 'delegate_to_reviewer',
        role: 'manager',
        note: longDesc,
      });
      expect(result!.level1).toContain('...');
      expect(result!.level2['fullständig beskrivning']).toBe(longDesc);
    });
  });

  // =========================================================
  // copy_to_target
  // =========================================================
  describe('copy_to_target', () => {
    it('narrates copy_to_target', () => {
      const result = narrateAuditEvent({
        tool: 'copy_to_target',
        role: 'merger',
        display_files: ['src/core/narrative.ts'],
        destination: '/Users/x/repos/neuron-hq/src/core/narrative.ts',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('📁 Merger kopierar fil till target-repo');
      expect(result!.level2.källsökväg).toBe('src/core/narrative.ts');
      expect(result!.level2.målsökväg).toBe('src/core/narrative.ts');
    });
  });

  // =========================================================
  // adaptive_hints
  // =========================================================
  describe('adaptive_hints', () => {
    it('narrates adaptive_hints', () => {
      const result = narrateAuditEvent({
        tool: 'adaptive_hints',
        role: 'implementer',
        warnings: 2,
        strengths: 3,
        note: 'Missing tests, Lint warnings; Good structure, Clean code, Fast',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('💡 Implementer får 2 varningar, 3 styrkor');
      expect(result!.level2.lista).toContain('Missing tests');
    });
  });

  // =========================================================
  // agent_message
  // =========================================================
  describe('agent_message', () => {
    it('narrates agent_message', () => {
      const result = narrateAuditEvent({
        tool: 'agent_message',
        role: 'reviewer',
        note: 'All tests pass, code looks good',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('💬 Reviewer: "All tests pass, code looks good"');
      expect(result!.level2.meddelande).toBe('All tests pass, code looks good');
    });

    it('truncates long message in level1', () => {
      const longMsg = 'm'.repeat(80);
      const result = narrateAuditEvent({
        tool: 'agent_message',
        role: 'reviewer',
        note: longMsg,
      });
      expect(result!.level1).toContain('...');
      expect(result!.level2.meddelande).toBe(longMsg);
    });
  });

  // =========================================================
  // run (phase === 'start')
  // =========================================================
  describe('run (phase start)', () => {
    it('narrates run start', () => {
      const result = narrateAuditEvent({
        tool: 'run',
        phase: 'start',
        role: 'manager',
        note: 'Starting neuron-hq implementation run',
      });
      expect(result).not.toBeNull();
      expect(result!.level1).toBe('🚀 Manager startar — "Starting neuron-hq implementation run"');
    });

    it('returns null for run without phase start', () => {
      const result = narrateAuditEvent({
        tool: 'run',
        phase: 'end',
        role: 'manager',
      });
      expect(result).toBeNull();
    });
  });

  // =========================================================
  // Unknown tool
  // =========================================================
  describe('unknown tool', () => {
    it('returns null for unrecognized tool', () => {
      const result = narrateAuditEvent({
        tool: 'some_unknown_tool',
        role: 'manager',
      });
      expect(result).toBeNull();
    });

    it('returns null when tool is missing', () => {
      const result = narrateAuditEvent({ role: 'manager' });
      expect(result).toBeNull();
    });
  });

  // =========================================================
  // Agent name fallback
  // =========================================================
  describe('agent name', () => {
    it('uses data.agent when data.role is missing', () => {
      const result = narrateAuditEvent({
        tool: 'read_file',
        agent: 'implementer',
        ts: '2026-03-16T12:00:00Z',
        display_files: ['src/test.ts'],
      });
      expect(result!.level1).toContain('Implementer');
    });

    it('shows Unknown when both role and agent missing', () => {
      const result = narrateAuditEvent({
        tool: 'read_file',
        ts: '2026-03-16T12:00:00Z',
        display_files: ['src/test.ts'],
      });
      expect(result!.level1).toContain('Unknown');
    });
  });

  // =========================================================
  // Integration: narrateAudit now falls through to narrateAuditEvent
  // =========================================================
  describe('narrateAudit integration via narrateEvent', () => {
    it('audit with tool=read_file returns level1 string', () => {
      const result = narrateEvent('audit', {
        tool: 'read_file',
        role: 'implementer',
        ts: '2026-03-16T12:00:00Z',
        display_files: ['src/core/foo.ts'],
        allowed: true,
      });
      expect(result).toBe('📖 Implementer läser foo.ts');
    });

    it('audit with tool=bash_exec returns level1 string', () => {
      const result = narrateEvent('audit', {
        tool: 'bash_exec',
        role: 'implementer',
        display_command: 'npm test',
        exit_code: 0,
        allowed: true,
      });
      expect(result).toBe('⚡ Implementer kör: npm test');
    });

    it('audit delegation still works as before', () => {
      const result = narrateEvent('audit', {
        role: 'manager',
        target: 'implementer',
        delegation: true,
      });
      expect(result).toBe('📤 Manager → Implementer: delegering');
    });

    it('audit blocked still works as before', () => {
      const result = narrateEvent('audit', {
        allowed: false,
        reason: 'rm command not allowed',
      });
      expect(result).toBe('🚫 Policy blockerade: rm command not allowed');
    });

    it('audit with unknown tool still returns null', () => {
      const result = narrateEvent('audit', {
        tool: 'unknown_tool',
        role: 'manager',
        allowed: true,
      });
      expect(result).toBeNull();
    });
  });
});
