import { describe, it, expect } from 'vitest';
import {
  captureFieldOfView,
  summarizeFieldOfView,
  type AuditEntry,
  type FieldOfView,
} from '../../src/core/field-of-view.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AuditEntry>): AuditEntry {
  return { ts: '2025-01-01T00:00:00Z', ...overrides };
}

// ---------------------------------------------------------------------------
// captureFieldOfView
// ---------------------------------------------------------------------------

describe('captureFieldOfView', () => {
  it('returns a valid FieldOfView for empty inputs', () => {
    const fov = captureFieldOfView('manager', []);
    expect(fov.agent).toBe('manager');
    expect(fov.timestamp).toBeTruthy();
    expect(fov.sees.filesRead).toEqual([]);
    expect(fov.sees.filesModified).toEqual([]);
    expect(fov.sees.briefContent).toBe('');
    expect(fov.sees.taskDescription).toBe('');
    expect(fov.doesNotSee.fullGitHistory).toBe(true);
    expect(fov.doesNotSee.otherRunHistory).toBe(true);
    expect(fov.doesNotSee.otherAgentWork).toEqual([]);
    expect(fov.doesNotSee.unreadFiles).toEqual([]);
    expect(fov.doesNotSee.policyConstraints).toEqual([]);
  });

  it('collects filesRead from read_file tool entries', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'manager', tool: 'read_file', args: { path: 'src/core/types.ts' } }),
      makeEntry({ role: 'manager', tool: 'read_file', args: { path: 'brief.md' } }),
    ];
    const fov = captureFieldOfView('manager', entries);
    expect(fov.sees.filesRead).toEqual(['src/core/types.ts', 'brief.md']);
  });

  it('collects filesModified from write_file tool entries', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'implementer', tool: 'write_file', args: { path: 'src/core/foo.ts' } }),
    ];
    const fov = captureFieldOfView('implementer', entries);
    expect(fov.sees.filesModified).toEqual(['src/core/foo.ts']);
  });

  it('collects filesModified from bash commands with > redirect', () => {
    const entries: AuditEntry[] = [
      makeEntry({
        role: 'implementer',
        tool: 'bash_exec',
        args: { command: 'echo hello > output.txt' },
      }),
    ];
    const fov = captureFieldOfView('implementer', entries);
    expect(fov.sees.filesModified).toContain('output.txt');
  });

  it('collects filesModified from bash commands with tee', () => {
    const entries: AuditEntry[] = [
      makeEntry({
        role: 'implementer',
        tool: 'bash',
        args: { command: 'echo hello | tee result.log' },
      }),
    ];
    const fov = captureFieldOfView('implementer', entries);
    expect(fov.sees.filesModified).toContain('result.log');
  });

  it('deduplicates file paths', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'manager', tool: 'read_file', args: { path: 'brief.md' } }),
      makeEntry({ role: 'manager', tool: 'read_file', args: { path: 'brief.md' } }),
    ];
    const fov = captureFieldOfView('manager', entries);
    expect(fov.sees.filesRead).toEqual(['brief.md']);
  });

  it('filters entries by agent name case-insensitively', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'Manager', tool: 'read_file', args: { path: 'a.ts' } }),
      makeEntry({ agent: 'MANAGER', tool: 'read_file', args: { path: 'b.ts' } }),
      makeEntry({ role: 'implementer', tool: 'read_file', args: { path: 'c.ts' } }),
    ];
    const fov = captureFieldOfView('manager', entries);
    expect(fov.sees.filesRead).toEqual(['a.ts', 'b.ts']);
  });

  it('computes unreadFiles from workspaceFiles minus read/modified files', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'manager', tool: 'read_file', args: { path: 'a.ts' } }),
      makeEntry({ role: 'manager', tool: 'write_file', args: { path: 'b.ts' } }),
    ];
    const fov = captureFieldOfView('manager', entries, {
      workspaceFiles: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
    });
    expect(fov.doesNotSee.unreadFiles).toEqual(['c.ts', 'd.ts']);
  });

  it('generates otherAgentWork strings in Swedish', () => {
    const fov = captureFieldOfView('manager', [], {
      parallelAgents: [
        { agent: 'implementer', taskId: 'T3' },
        { agent: 'reviewer', taskId: 'T1' },
      ],
    });
    expect(fov.doesNotSee.otherAgentWork).toEqual([
      'Implementer arbetar parallellt med T3',
      'Reviewer arbetar parallellt med T1',
    ]);
  });

  it('collects policyConstraints from options and blocked entries', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'implementer', tool: 'bash_exec', allowed: false }),
    ];
    const fov = captureFieldOfView('implementer', entries, {
      policyConstraints: ['max 150 lines per diff'],
    });
    expect(fov.doesNotSee.policyConstraints).toEqual([
      'max 150 lines per diff',
      'bash_exec',
    ]);
  });

  it('passes briefContent and taskDescription from options', () => {
    const fov = captureFieldOfView('manager', [], {
      briefContent: 'Add field-of-view module',
      taskDescription: 'Create src/core/field-of-view.ts',
    });
    expect(fov.sees.briefContent).toBe('Add field-of-view module');
    expect(fov.sees.taskDescription).toBe('Create src/core/field-of-view.ts');
  });

  it('handles entries without args gracefully', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'manager', tool: 'read_file' }),
      makeEntry({ role: 'manager', tool: 'write_file', args: {} }),
    ];
    const fov = captureFieldOfView('manager', entries);
    expect(fov.sees.filesRead).toEqual([]);
    expect(fov.sees.filesModified).toEqual([]);
  });

  it('ignores entries from other agents', () => {
    const entries: AuditEntry[] = [
      makeEntry({ role: 'implementer', tool: 'read_file', args: { path: 'secret.ts' } }),
    ];
    const fov = captureFieldOfView('manager', entries);
    expect(fov.sees.filesRead).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeFieldOfView
// ---------------------------------------------------------------------------

describe('summarizeFieldOfView', () => {
  function makeFov(overrides: Partial<FieldOfView> = {}): FieldOfView {
    return {
      agent: 'manager',
      timestamp: '2025-01-01T00:00:00Z',
      sees: {
        briefContent: '',
        taskDescription: '',
        filesRead: [],
        filesModified: [],
      },
      doesNotSee: {
        otherAgentWork: [],
        fullGitHistory: true,
        otherRunHistory: true,
        unreadFiles: [],
        policyConstraints: [],
      },
      ...overrides,
    };
  }

  it('returns a summary with files read', () => {
    const fov = makeFov({
      sees: {
        briefContent: '',
        taskDescription: '',
        filesRead: ['brief.md', 'src/core/types.ts', 'src/core/event-bus.ts'],
        filesModified: [],
      },
    });
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('Manager läste 3 filer');
    expect(summary).toContain('brief.md');
    expect(summary).toContain('types.ts');
    expect(summary).toContain('event-bus.ts');
  });

  it('handles singular file correctly', () => {
    const fov = makeFov({
      sees: {
        briefContent: '',
        taskDescription: '',
        filesRead: ['brief.md'],
        filesModified: [],
      },
    });
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('Manager läste 1 fil');
  });

  it('reports no files read', () => {
    const fov = makeFov();
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('Manager läste inga filer');
  });

  it('mentions unread files count', () => {
    const fov = makeFov({
      doesNotSee: {
        otherAgentWork: [],
        fullGitHistory: true,
        otherRunHistory: true,
        unreadFiles: ['a.ts', 'b.ts'],
        policyConstraints: [],
      },
    });
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('2 olästa filer');
  });

  it('mentions singular unread file', () => {
    const fov = makeFov({
      doesNotSee: {
        otherAgentWork: [],
        fullGitHistory: true,
        otherRunHistory: true,
        unreadFiles: ['a.ts'],
        policyConstraints: [],
      },
    });
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('1 oläst fil');
  });

  it('mentions parallel agent work', () => {
    const fov = makeFov({
      doesNotSee: {
        otherAgentWork: ['Implementer arbetar parallellt med T3'],
        fullGitHistory: true,
        otherRunHistory: true,
        unreadFiles: [],
        policyConstraints: [],
      },
    });
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('parallellt arbete av Implementer');
  });

  it('mentions policy constraints', () => {
    const fov = makeFov({
      doesNotSee: {
        otherAgentWork: [],
        fullGitHistory: true,
        otherRunHistory: true,
        unreadFiles: [],
        policyConstraints: ['bash_exec', 'rm'],
      },
    });
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('2 policy-begränsningar');
  });

  it('produces a complete summary with all blind spots', () => {
    const fov = makeFov({
      sees: {
        briefContent: '',
        taskDescription: '',
        filesRead: ['brief.md', 'src/core/types.ts', 'src/core/event-bus.ts'],
        filesModified: [],
      },
      doesNotSee: {
        otherAgentWork: ['Implementer arbetar parallellt med T3'],
        fullGitHistory: true,
        otherRunHistory: true,
        unreadFiles: ['hidden.ts', 'secret.ts'],
        policyConstraints: [],
      },
    });
    const summary = summarizeFieldOfView(fov);
    expect(summary).toContain('Manager läste 3 filer');
    expect(summary).toContain('Såg inte:');
    expect(summary).toContain('2 olästa filer');
    expect(summary).toContain('parallellt arbete av Implementer');
  });

  it('ends with a period', () => {
    const fov = makeFov();
    const summary = summarizeFieldOfView(fov);
    expect(summary.endsWith('.')).toBe(true);
  });
});
