import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  trimEntries,
  renderFallbackNarrative,
  renderNarrativeMarkdown,
} from '../../src/core/run-narrative.js';
import type { NarrativeData } from '../../src/core/run-narrative.js';
import type { NarrativeEntry } from '../../src/core/narrative-collector.js';
import type { Decision } from '../../src/core/decision-extractor.js';

// ── Helpers ──────────────────────────────────────────────

function makeEntry(overrides: Partial<NarrativeEntry> = {}): NarrativeEntry {
  return {
    ts: '2026-03-19T12:00:00Z',
    agent: 'manager',
    type: 'action',
    summary: 'Test entry',
    ...overrides,
  };
}

function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: 'd-test-001',
    timestamp: '2026-03-19T12:00:00Z',
    agent: 'manager',
    type: 'plan',
    what: 'Skapade en plan',
    why: 'Briefen kräver det',
    confidence: 'high',
    ...overrides,
  };
}

function makeData(overrides: Partial<NarrativeData> = {}): NarrativeData {
  return {
    runId: 'test-run-001',
    briefTitle: 'Test Brief',
    stoplight: 'GREEN',
    agents: ['manager', 'implementer'],
    entries: [makeEntry()],
    decisions: [makeDecision()],
    ...overrides,
  };
}

// ── trimEntries ──────────────────────────────────────────

describe('trimEntries', () => {
  it('returns empty array for empty input', () => {
    expect(trimEntries([])).toEqual([]);
  });

  it('returns all entries when under max', () => {
    const entries = [makeEntry(), makeEntry(), makeEntry()];
    const result = trimEntries(entries, 50);
    expect(result).toHaveLength(3);
  });

  it('prioritizes decision entries', () => {
    const entries = [
      makeEntry({ type: 'action', summary: 'action1' }),
      makeEntry({ type: 'decision', summary: 'decision1' }),
      makeEntry({ type: 'action', summary: 'action2' }),
    ];
    const result = trimEntries(entries, 2);
    // Decision should always be included
    expect(result.some((e) => e.summary === 'decision1')).toBe(true);
  });

  it('preserves all decisions in a mixed set', () => {
    const entries: NarrativeEntry[] = [];
    // 5 decision entries
    for (let i = 0; i < 5; i++) {
      entries.push(makeEntry({ type: 'decision', summary: `decision-${i}` }));
    }
    // 30 action entries
    for (let i = 0; i < 30; i++) {
      entries.push(makeEntry({ type: 'action', summary: `action-${i}` }));
    }
    const result = trimEntries(entries, 20);
    // All 5 decisions must be preserved
    const decisions = result.filter((e) => e.type === 'decision');
    expect(decisions).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(decisions[i].summary).toBe(`decision-${i}`);
    }
  });

  it('includes first 10 and last 10 non-decision entries', () => {
    const entries: NarrativeEntry[] = [];
    // 30 action entries
    for (let i = 0; i < 30; i++) {
      entries.push(makeEntry({ summary: `action-${i}` }));
    }
    const result = trimEntries(entries, 20);
    // First 10
    expect(result[0].summary).toBe('action-0');
    expect(result[9].summary).toBe('action-9');
    // Last entries should be from the end
    expect(result[result.length - 1].summary).toBe('action-29');
  });

  it('includes warnings over plain actions in remaining slots', () => {
    const entries: NarrativeEntry[] = [];
    // 20 startup non-decision entries
    for (let i = 0; i < 20; i++) {
      entries.push(makeEntry({ summary: `startup-${i}` }));
    }
    // A warning in the middle (index 20, outside first 10 / last 10)
    entries.splice(15, 0, makeEntry({ type: 'warning', summary: 'important-warning' }));
    // Push to end so middle-area has the warning
    const result = trimEntries(entries, 25);
    expect(result.some((e) => e.summary === 'important-warning')).toBe(true);
  });

  it('keeps max 50 when given 100 entries', () => {
    const entries: NarrativeEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(makeEntry({ type: 'decision', summary: `d-${i}` }));
    }
    const result = trimEntries(entries, 50);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('respects character limit by removing from middle', () => {
    // Create entries with very long details to exceed maxChars
    const entries: NarrativeEntry[] = [];
    for (let i = 0; i < 10; i++) {
      entries.push(
        makeEntry({
          summary: `entry-${i}`,
          detail: 'x'.repeat(500),
        }),
      );
    }
    const result = trimEntries(entries, 50, 2000);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(2000);
    expect(result.length).toBeLessThan(10);
  });

  it('respects default 30000 char limit', () => {
    const entries: NarrativeEntry[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push(
        makeEntry({
          summary: `entry-${i}`,
          detail: 'y'.repeat(2000),
        }),
      );
    }
    const result = trimEntries(entries);
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(30000);
  });
});

// ── renderFallbackNarrative ──────────────────────────────

describe('renderFallbackNarrative', () => {
  it('produces YAML frontmatter', () => {
    const md = renderFallbackNarrative(makeData());
    expect(md).toContain('---');
    expect(md).toContain('run_id: test-run-001');
    expect(md).toContain('stoplight: GREEN');
    expect(md).toContain('agents: [manager, implementer]');
  });

  it('includes all sections: Sammanfattning, Vad hände, Nyckelbeslut, Slutsats', () => {
    const md = renderFallbackNarrative(makeData());
    expect(md).toContain('## Sammanfattning');
    expect(md).toContain('## Vad hände');
    expect(md).toContain('## Nyckelbeslut');
    expect(md).toContain('## Slutsats');
  });

  it('includes title heading', () => {
    const md = renderFallbackNarrative(makeData());
    expect(md).toContain('# Körningsberättelse: Test Brief');
  });

  it('includes summary with stoplight', () => {
    const md = renderFallbackNarrative(makeData());
    expect(md).toContain('## Sammanfattning');
    expect(md).toContain('Körning test-run-001 avslutades med stoplight: GREEN.');
  });

  it('groups entries by agent', () => {
    const data = makeData({
      entries: [
        makeEntry({ agent: 'manager', summary: 'Manager did X' }),
        makeEntry({ agent: 'implementer', summary: 'Impl did Y' }),
      ],
    });
    const md = renderFallbackNarrative(data);
    expect(md).toContain('### Manager');
    expect(md).toContain('- Manager did X');
    expect(md).toContain('### Implementer');
    expect(md).toContain('- Impl did Y');
  });

  it('renders single agent correctly', () => {
    const data = makeData({
      agents: ['reviewer'],
      entries: [makeEntry({ agent: 'reviewer', summary: 'Reviewer checked code' })],
      decisions: [makeDecision({ agent: 'reviewer' })],
    });
    const md = renderFallbackNarrative(data);
    expect(md).toContain('### Reviewer');
    expect(md).toContain('- Reviewer checked code');
    expect(md).toContain('agents: [reviewer]');
  });

  it('includes decisions section using narrateDecisionSimple', () => {
    const data = makeData({
      decisions: [makeDecision({ what: 'Skapade en plan', confidence: 'high' })],
    });
    const md = renderFallbackNarrative(data);
    expect(md).toContain('## Nyckelbeslut');
    expect(md).toContain('Agenten Skapade en plan (lyckas oftast)');
  });

  it('shows "Inga explicita beslut loggade." when no decisions', () => {
    const data = makeData({ decisions: [] });
    const md = renderFallbackNarrative(data);
    expect(md).toContain('Inga explicita beslut loggade.');
  });

  it('generates minimal narrative when 0 entries and 0 decisions', () => {
    const data = makeData({ entries: [], decisions: [] });
    const md = renderFallbackNarrative(data);
    expect(md).toContain('Körningen avbröts innan agenter hann agera.');
    // Should NOT have Vad hände or Nyckelbeslut
    expect(md).not.toContain('## Vad hände');
    expect(md).not.toContain('## Nyckelbeslut');
  });

  it('includes Slutsats section', () => {
    const md = renderFallbackNarrative(makeData());
    expect(md).toContain('## Slutsats');
    expect(md).toContain('Status: GREEN');
  });
});

// ── renderNarrativeMarkdown ──────────────────────────────

describe('renderNarrativeMarkdown', () => {
  it('generates correct frontmatter with required fields', () => {
    const data = makeData();
    const md = renderNarrativeMarkdown(data);
    // Check YAML frontmatter
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('generated:');
    expect(md).toContain('run_id: test-run-001');
    expect(md).toContain('stoplight: GREEN');
    expect(md).toContain('agents: [manager, implementer]');
  });

  it('uses aiBody when provided', () => {
    const data = makeData();
    const md = renderNarrativeMarkdown(data, 'AI generated content here');
    expect(md).toContain('AI generated content here');
    expect(md).toContain('run_id: test-run-001');
    expect(md).toContain('stoplight: GREEN');
  });

  it('falls back to renderFallbackNarrative when no aiBody', () => {
    const data = makeData();
    const md = renderNarrativeMarkdown(data);
    expect(md).toContain('# Körningsberättelse: Test Brief');
    expect(md).toContain('## Sammanfattning');
  });

  it('always includes frontmatter even with aiBody', () => {
    const data = makeData();
    const md = renderNarrativeMarkdown(data, 'Custom body');
    expect(md).toMatch(/^---\n/);
    expect(md).toContain('generated:');
  });
});
