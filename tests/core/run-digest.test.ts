import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  generateDigest,
  extractHighlights,
  parseBriefTitle,
  parseTaskPlan,
  formatDuration,
} from '../../src/core/run-digest.js';

// ---------------------------------------------------------------------------
// Helper: create a temp run directory with optional mock files
// ---------------------------------------------------------------------------

interface MockFiles {
  'metrics.json'?: object;
  'usage.json'?: object;
  'task_scores.jsonl'?: object[];
  'report.md'?: string;
  'brief.md'?: string;
  'task_plan.md'?: string;
  'knowledge.md'?: string;
  'audit.jsonl'?: object[];
}

async function createRunDir(files: MockFiles = {}): Promise<string> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'run-digest-'),
  );

  for (const [filename, content] of Object.entries(files)) {
    if (content === undefined) continue;

    if (filename.endsWith('.jsonl') && Array.isArray(content)) {
      const lines = content.map((obj) => JSON.stringify(obj)).join('\n');
      await fs.writeFile(path.join(tempDir, filename), lines + '\n');
    } else if (typeof content === 'string') {
      await fs.writeFile(path.join(tempDir, filename), content);
    } else {
      await fs.writeFile(
        path.join(tempDir, filename),
        JSON.stringify(content),
      );
    }
  }

  return tempDir;
}

// ---------------------------------------------------------------------------
// Standard mock data
// ---------------------------------------------------------------------------

function standardMockFiles(): MockFiles {
  return {
    'metrics.json': {
      runid: '20260301-1200-test-run',
      timing: {
        started_at: '2026-03-01T12:00:00.000Z',
        completed_at: '2026-03-01T12:45:00.000Z',
        duration_seconds: 2700,
      },
      testing: {
        baseline_passed: 100,
        after_passed: 115,
        tests_added: 15,
      },
      tokens: {
        total_input: 200000,
        total_output: 10000,
      },
      code: {
        files_modified: 3,
        files_new: 2,
        insertions: 150,
        deletions: 30,
      },
    },
    'usage.json': {
      runid: '20260301-1200-test-run',
      total_input_tokens: 200000,
      total_output_tokens: 10000,
    },
    'brief.md': '# Brief: Implement run digest feature\n\nGenerate markdown from run artifacts.',
    'report.md': 'STOPLIGHT: GREEN\n\nAll tests pass.',
    'task_plan.md':
      '# Task Plan\n- **T1**: Create run-digest.ts module\n- **T2**: Write tests for run-digest\n',
    'knowledge.md':
      '# Learnings\n- Use readJsonSafe for safe file reading\n- Keep functions pure when possible\n- Test edge cases with empty files\n',
    'task_scores.jsonl': [
      { task_id: 'T1', aggregate: 0.9, summary: 'Created module' },
      { task_id: 'T2', aggregate: 0.85, summary: 'Tests written' },
    ],
    'audit.jsonl': [
      {
        ts: '2026-03-01T12:01:00.000Z',
        role: 'manager',
        tool: 'delegate_to_implementer',
        allowed: true,
      },
      {
        ts: '2026-03-01T12:10:00.000Z',
        role: 'implementer',
        tool: 'bash_exec',
        allowed: true,
        note: 'Running tests',
      },
      {
        ts: '2026-03-01T12:15:00.000Z',
        role: 'implementer',
        tool: 'bash_exec',
        allowed: false,
        policy_event: 'BLOCKED: forbidden pattern',
      },
      {
        ts: '2026-03-01T12:30:00.000Z',
        role: 'manager',
        tool: 'delegate_to_reviewer',
        allowed: true,
      },
      {
        ts: '2026-03-01T12:40:00.000Z',
        role: 'manager',
        tool: 'delegate_to_merger',
        allowed: true,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// generateDigest
// ---------------------------------------------------------------------------

describe('generateDigest', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createRunDir(standardMockFiles());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns a markdown string', async () => {
    const md = await generateDigest(tempDir);
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(0);
  });

  it('writes digest.md to runDir', async () => {
    await generateDigest(tempDir);
    const written = await fs.readFile(
      path.join(tempDir, 'digest.md'),
      'utf-8',
    );
    expect(written.length).toBeGreaterThan(0);
    expect(written).toContain('# Körning');
  });

  it('contains Plan section', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('## Plan');
    expect(md).toContain('**T1**');
    expect(md).toContain('**T2**');
  });

  it('contains Utfört section', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('## Utfört');
    expect(md).toContain('✅');
    expect(md).toContain('Created module');
  });

  it('contains Händelser section', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('## Händelser');
    expect(md).toContain('Delegering');
  });

  it('contains Resultat section', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('## Resultat');
    expect(md).toContain('Filer:');
    expect(md).toContain('Tester:');
    expect(md).toContain('Tokens:');
  });

  it('contains Lärdomar section', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('## Lärdomar');
    expect(md).toContain('readJsonSafe');
  });

  it('includes brief title in header', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('Implement run digest feature');
  });

  it('includes timing information', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('2026-03-01');
    expect(md).toContain('12:00');
    expect(md).toContain('12:45');
    expect(md).toContain('45 min');
  });

  it('includes stoplight status with emoji', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('🟢');
    expect(md).toContain('GREEN');
  });

  it('includes cost', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('$');
  });

  it('includes test count', async () => {
    const md = await generateDigest(tempDir);
    expect(md).toContain('+15 tester');
    expect(md).toContain('115 totalt');
    expect(md).toContain('100 baseline');
  });

  it('handles missing files gracefully', async () => {
    const emptyDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'run-digest-empty-'),
    );
    try {
      const md = await generateDigest(emptyDir);
      expect(typeof md).toBe('string');
      expect(md).toContain('# Körning');
      expect(md).toContain('Ingen uppgiftsplan tillgänglig.');
      expect(md).toContain('Inga dokumenterade lärdomar.');
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('handles empty runDir without crashing', async () => {
    const emptyDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'run-digest-empty2-'),
    );
    try {
      const md = await generateDigest(emptyDir);
      expect(md).toContain('## Plan');
      expect(md).toContain('## Utfört');
      expect(md).toContain('## Händelser');
      expect(md).toContain('## Resultat');
      expect(md).toContain('## Lärdomar');
    } finally {
      await fs.rm(emptyDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// extractHighlights
// ---------------------------------------------------------------------------

describe('extractHighlights', () => {
  it('filters delegations', () => {
    const lines = [
      JSON.stringify({
        ts: '2026-03-01T12:00:00Z',
        tool: 'delegate_to_implementer',
        role: 'manager',
        allowed: true,
      }),
      JSON.stringify({
        ts: '2026-03-01T12:01:00Z',
        tool: 'bash_exec',
        role: 'implementer',
        allowed: true,
      }),
    ];
    const events = extractHighlights(lines);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain('Delegering');
  });

  it('filters policy blocks', () => {
    const lines = [
      JSON.stringify({
        ts: '2026-03-01T12:00:00Z',
        tool: 'bash_exec',
        role: 'implementer',
        allowed: false,
        policy_event: 'BLOCKED: rm -rf',
      }),
    ];
    const events = extractHighlights(lines);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain('Blockerad');
  });

  it('limits to 20 entries', () => {
    const lines: string[] = [];
    for (let i = 0; i < 30; i++) {
      lines.push(
        JSON.stringify({
          ts: `2026-03-01T12:${String(i).padStart(2, '0')}:00Z`,
          tool: 'delegate_to_implementer',
          role: 'manager',
          allowed: true,
        }),
      );
    }
    const events = extractHighlights(lines);
    expect(events).toHaveLength(20);
  });

  it('returns chronological order', () => {
    const lines = [
      JSON.stringify({
        ts: '2026-03-01T12:30:00Z',
        tool: 'delegate_to_reviewer',
        role: 'manager',
        allowed: true,
      }),
      JSON.stringify({
        ts: '2026-03-01T12:00:00Z',
        tool: 'delegate_to_implementer',
        role: 'manager',
        allowed: true,
      }),
    ];
    const events = extractHighlights(lines);
    expect(events).toHaveLength(2);
    expect(events[0].timestamp).toBe('2026-03-01T12:00:00Z');
    expect(events[1].timestamp).toBe('2026-03-01T12:30:00Z');
  });

  it('filters test-related events', () => {
    const lines = [
      JSON.stringify({
        ts: '2026-03-01T12:00:00Z',
        tool: 'bash_exec',
        role: 'implementer',
        allowed: true,
        note: 'Running test suite',
      }),
    ];
    const events = extractHighlights(lines);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain('🧪');
  });

  it('filters merge operations', () => {
    const lines = [
      JSON.stringify({
        ts: '2026-03-01T12:00:00Z',
        tool: 'delegate_to_merger',
        role: 'manager',
        allowed: true,
      }),
    ];
    const events = extractHighlights(lines);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain('Merge');
  });

  it('returns empty for no interesting events', () => {
    const lines = [
      JSON.stringify({
        ts: '2026-03-01T12:00:00Z',
        tool: 'read_file',
        role: 'implementer',
        allowed: true,
      }),
    ];
    const events = extractHighlights(lines);
    expect(events).toHaveLength(0);
  });

  it('handles invalid JSON lines gracefully', () => {
    const lines = ['not json', '{ broken'];
    const events = extractHighlights(lines);
    expect(events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseBriefTitle
// ---------------------------------------------------------------------------

describe('parseBriefTitle', () => {
  it('extracts H1', () => {
    const content = '# My Feature Brief\n\nSome description.';
    expect(parseBriefTitle(content)).toBe('My Feature Brief');
  });

  it('strips Brief: prefix from H1', () => {
    const content = '# Brief: Implement new module\n\nDetails.';
    expect(parseBriefTitle(content)).toBe('Implement new module');
  });

  it('falls back to first line', () => {
    const content = 'Some title without markdown\n\nDescription.';
    expect(parseBriefTitle(content)).toBe(
      'Some title without markdown',
    );
  });

  it('returns default for empty', () => {
    expect(parseBriefTitle('')).toBe('Okänd brief');
    expect(parseBriefTitle('   ')).toBe('Okänd brief');
  });

  it('handles H1 with extra spaces', () => {
    const content = '#   Spaced Title  \nBody';
    expect(parseBriefTitle(content)).toBe('Spaced Title');
  });
});

// ---------------------------------------------------------------------------
// parseTaskPlan
// ---------------------------------------------------------------------------

describe('parseTaskPlan', () => {
  it('extracts task IDs and descriptions from bullet format', () => {
    const content = '- **T1**: Create module\n- **T2**: Write tests\n';
    const tasks = parseTaskPlan(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({ id: 'T1', description: 'Create module' });
    expect(tasks[1]).toEqual({ id: 'T2', description: 'Write tests' });
  });

  it('extracts from plain bullet format', () => {
    const content = '- T1: Create module\n- T2: Write tests\n';
    const tasks = parseTaskPlan(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('T1');
  });

  it('extracts from heading format', () => {
    const content = '## T1 — Create module\n## T2 — Write tests\n';
    const tasks = parseTaskPlan(content);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({ id: 'T1', description: 'Create module' });
  });

  it('returns empty for empty content', () => {
    expect(parseTaskPlan('')).toEqual([]);
    expect(parseTaskPlan('   ')).toEqual([]);
  });

  it('ignores non-task lines', () => {
    const content =
      '# Plan\nSome text\n- **T1**: Only task\nMore text\n';
    const tasks = parseTaskPlan(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('T1');
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('formats minutes correctly', () => {
    expect(formatDuration(300)).toBe('5 min');
    expect(formatDuration(2700)).toBe('45 min');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3660)).toBe('1 tim 1 min');
    expect(formatDuration(7200)).toBe('2 tim');
    expect(formatDuration(5400)).toBe('1 tim 30 min');
  });

  it('formats zero seconds', () => {
    expect(formatDuration(0)).toBe('0 min');
  });

  it('rounds to nearest minute', () => {
    expect(formatDuration(89)).toBe('1 min');
    expect(formatDuration(150)).toBe('3 min');
  });
});

// ---------------------------------------------------------------------------
// Beslut section in generateDigest
// ---------------------------------------------------------------------------

describe('generateDigest - Beslut section', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('includes Beslut section when audit has delegation events', async () => {
    tempDir = await createRunDir(standardMockFiles());
    const md = await generateDigest(tempDir);
    expect(md).toContain('## Beslut');
  });

  it('Beslut section lists delegation decisions', async () => {
    tempDir = await createRunDir(standardMockFiles());
    const md = await generateDigest(tempDir);
    expect(md).toContain('Delegated to implementer');
    expect(md).toContain('Delegated to reviewer');
  });

  it('Beslut section groups decisions by agent', async () => {
    tempDir = await createRunDir(standardMockFiles());
    const md = await generateDigest(tempDir);
    // Manager made delegation decisions
    expect(md).toContain('Manager fattade');
    expect(md).toContain('beslut:');
  });

  it('Beslut section includes confidence indicators', async () => {
    tempDir = await createRunDir(standardMockFiles());
    const md = await generateDigest(tempDir);
    // Delegation decisions get medium confidence by default
    expect(md).toMatch(/viss osäkerhet/);
  });

  it('Beslut section includes Synfält subsection', async () => {
    tempDir = await createRunDir(standardMockFiles());
    const md = await generateDigest(tempDir);
    expect(md).toContain('### Synfält');
    expect(md).toContain('Manager');
  });

  it('omits Beslut section when no audit events exist', async () => {
    const emptyDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'run-digest-no-beslut-'),
    );
    tempDir = emptyDir;
    const md = await generateDigest(emptyDir);
    expect(md).not.toContain('## Beslut');
  });

  it('Beslut section appears after Lärdomar', async () => {
    tempDir = await createRunDir(standardMockFiles());
    const md = await generateDigest(tempDir);
    const lardomarIndex = md.indexOf('## Lärdomar');
    const beslutIndex = md.indexOf('## Beslut');
    expect(lardomarIndex).toBeGreaterThan(-1);
    expect(beslutIndex).toBeGreaterThan(-1);
    expect(beslutIndex).toBeGreaterThan(lardomarIndex);
  });

  it('includes fix decisions when a blocked tool is retried', async () => {
    tempDir = await createRunDir({
      ...standardMockFiles(),
      'audit.jsonl': [
        {
          ts: '2026-03-01T12:01:00.000Z',
          role: 'manager',
          tool: 'delegate_to_implementer',
          allowed: true,
        },
        {
          ts: '2026-03-01T12:10:00.000Z',
          role: 'implementer',
          tool: 'bash_exec',
          allowed: false,
          policy_event: 'BLOCKED: pattern',
        },
        {
          ts: '2026-03-01T12:11:00.000Z',
          role: 'implementer',
          tool: 'bash_exec',
          allowed: true,
          note: 'Retried command',
        },
      ],
    });
    const md = await generateDigest(tempDir);
    expect(md).toContain('## Beslut');
    expect(md).toContain('Retried bash_exec');
  });
});

// ---------------------------------------------------------------------------
// RT-3 additional Beslut tests
// ---------------------------------------------------------------------------

describe('generateDigest - Beslut section RT-3 extras', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('includes Beslut section when audit has thinking entries with intents', async () => {
    tempDir = await createRunDir({
      'brief.md': '# Test Brief',
      'report.md': 'STOPLIGHT: GREEN',
      'audit.jsonl': [
        {
          ts: '2026-01-01T00:00:00Z',
          tool: 'delegate_to_implementer',
          role: 'manager',
          allowed: true,
          note: 'Delegerar T1',
        },
        {
          ts: '2026-01-01T00:01:00Z',
          event: 'agent:thinking',
          agent: 'manager',
          text: "I'll split the brief into 3 tasks because they are independent.",
        },
      ],
    });
    const digest = await generateDigest(tempDir);
    expect(digest).toContain('## Beslut');
  });

  it('extracts decisions from thinking text with I-should pattern', async () => {
    tempDir = await createRunDir({
      'brief.md': '# Test Brief',
      'report.md': 'STOPLIGHT: GREEN',
      'audit.jsonl': [
        {
          ts: '2026-01-01T00:00:00Z',
          event: 'agent:thinking',
          agent: 'implementer',
          text: "I should run the tests before committing.",
        },
        {
          ts: '2026-01-01T00:01:00Z',
          tool: 'delegate_to_implementer',
          role: 'manager',
          allowed: true,
        },
      ],
    });
    const digest = await generateDigest(tempDir);
    expect(digest).toContain('## Beslut');
    expect(digest).toContain('run the tests before committing');
  });

  it('includes confidence from high-confidence thinking keywords', async () => {
    tempDir = await createRunDir({
      'brief.md': '# Test Brief',
      'report.md': 'STOPLIGHT: GREEN',
      'audit.jsonl': [
        {
          ts: '2026-01-01T00:00:00Z',
          event: 'agent:thinking',
          agent: 'manager',
          text: "Clearly the right approach. I'll delegate to implementer.",
        },
        {
          ts: '2026-01-01T00:01:00Z',
          tool: 'delegate_to_implementer',
          role: 'manager',
          allowed: true,
        },
      ],
    });
    const digest = await generateDigest(tempDir);
    expect(digest).toContain('hög säkerhet');
  });

  it('includes confidence from low-confidence thinking keywords', async () => {
    tempDir = await createRunDir({
      'brief.md': '# Test Brief',
      'report.md': 'STOPLIGHT: GREEN',
      'audit.jsonl': [
        {
          ts: '2026-01-01T00:00:00Z',
          event: 'agent:thinking',
          agent: 'manager',
          text: "Unsure about this. I'll try parsing with regex.",
        },
        {
          ts: '2026-01-01T00:01:00Z',
          tool: 'delegate_to_implementer',
          role: 'manager',
          allowed: true,
        },
      ],
    });
    const digest = await generateDigest(tempDir);
    expect(digest).toContain('låg säkerhet');
  });

  it('handles audit.jsonl with only empty lines gracefully', async () => {
    const emptyAuditDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'run-digest-empty-audit-'),
    );
    tempDir = emptyAuditDir;
    await fs.writeFile(path.join(emptyAuditDir, 'audit.jsonl'), '\n\n');
    await fs.writeFile(path.join(emptyAuditDir, 'report.md'), 'STOPLIGHT: GREEN');
    await fs.writeFile(path.join(emptyAuditDir, 'brief.md'), '# Test');
    const digest = await generateDigest(emptyAuditDir);
    expect(digest).not.toContain('## Beslut');
  });

  it('counts multiple agents decisions separately', async () => {
    tempDir = await createRunDir({
      'brief.md': '# Test Brief',
      'report.md': 'STOPLIGHT: GREEN',
      'audit.jsonl': [
        {
          ts: '2026-01-01T00:00:00Z',
          tool: 'delegate_to_implementer',
          role: 'manager',
          allowed: true,
        },
        {
          ts: '2026-01-01T00:01:00Z',
          tool: 'delegate_to_reviewer',
          role: 'manager',
          allowed: true,
        },
        {
          ts: '2026-01-01T00:02:00Z',
          role: 'reviewer',
          tool: 'approve_change',
          allowed: true,
        },
      ],
    });
    const digest = await generateDigest(tempDir);
    expect(digest).toContain('Manager fattade');
    expect(digest).toContain('Reviewer fattade');
  });
});
