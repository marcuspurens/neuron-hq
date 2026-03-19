import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { generateRunNarrative } from '../../src/core/run-narrative.js';
import type { NarrativeEntry } from '../../src/core/narrative-collector.js';
import type { Decision } from '../../src/core/decision-extractor.js';

// ── Mock agent-client and model-registry ─────────────────

vi.mock('../../src/core/agent-client.js', () => ({
  createAgentClient: vi.fn(() => ({
    client: {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: '# AI Narrative\n\nThis is the AI body.' }],
        }),
      },
    },
    model: 'haiku-mock',
    maxTokens: 2048,
  })),
}));

vi.mock('../../src/core/model-registry.js', () => ({
  resolveModelConfig: vi.fn(() => ({
    provider: 'anthropic',
    model: 'haiku-mock',
    maxTokens: 2048,
  })),
}));

vi.mock('../../src/core/config.js', () => ({
  getConfig: () => ({ LOG_LEVEL: 'error' }),
}));

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
    what: 'Created plan',
    why: 'Brief required it',
    confidence: 'high',
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'run-narrative-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────

describe('generateRunNarrative', () => {
  it('does not overwrite existing run-narrative.md', async () => {
    const existingContent = 'existing narrative content - do not touch';
    await fs.writeFile(path.join(tmpDir, 'run-narrative.md'), existingContent, 'utf-8');
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [makeEntry()],
      decisions: [],
      baseDir: tmpDir,
    });
    expect(result).toBeNull();
    // Verify file content is truly unchanged
    const content = await fs.readFile(path.join(tmpDir, 'run-narrative.md'), 'utf-8');
    expect(content).toBe(existingContent);
  });

  it('writes minimal narrative when no entries and no decisions', async () => {
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [],
      decisions: [],
      baseDir: tmpDir,
    });
    expect(result).toBe(path.join(tmpDir, 'run-narrative.md'));
    const content = await fs.readFile(result!, 'utf-8');
    expect(content).toContain('Körningen avbröts innan agenter hann agera.');
  });

  it('reads briefTitle from brief.md', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'brief.md'),
      '# My Awesome Brief\nSome content',
      'utf-8',
    );
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [makeEntry()],
      decisions: [],
      baseDir: tmpDir,
    });
    const content = await fs.readFile(result!, 'utf-8');
    expect(content).toContain('My Awesome Brief');
  });

  it('reads stoplight from report.md', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'report.md'),
      'STOPLIGHT: YELLOW\nSome report',
      'utf-8',
    );
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [makeEntry()],
      decisions: [],
      baseDir: tmpDir,
    });
    const content = await fs.readFile(result!, 'utf-8');
    expect(content).toContain('stoplight: YELLOW');
  });

  it('falls back to UNKNOWN when report.md is missing', async () => {
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [makeEntry()],
      decisions: [],
      baseDir: tmpDir,
    });
    const content = await fs.readFile(result!, 'utf-8');
    expect(content).toContain('stoplight: UNKNOWN');
  });

  it('uses fallback narrative when no historian prompt exists', async () => {
    // No prompts/historian.md in tmpDir → fallback
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [makeEntry()],
      decisions: [makeDecision()],
      baseDir: tmpDir,
    });
    const content = await fs.readFile(result!, 'utf-8');
    // Should contain fallback structure
    expect(content).toContain('## Sammanfattning');
    expect(content).toContain('## Nyckelbeslut');
  });

  it('uses AI body when historian prompt exists and API succeeds', async () => {
    // Create prompts/historian.md with the narrative generation section
    const promptsDir = path.join(tmpDir, 'prompts');
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.writeFile(
      path.join(promptsDir, 'historian.md'),
      '# Historian\n\n## Narrative Generation Prompt\n\nWrite a narrative.',
      'utf-8',
    );

    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [makeEntry()],
      decisions: [makeDecision()],
      baseDir: tmpDir,
    });
    const content = await fs.readFile(result!, 'utf-8');
    // Should use AI response
    expect(content).toContain('AI Narrative');
    expect(content).toContain('This is the AI body.');
    // But still has frontmatter
    expect(content).toContain('run_id: test-run');
  });

  it('collects unique agents from entries', async () => {
    const entries = [
      makeEntry({ agent: 'manager' }),
      makeEntry({ agent: 'implementer' }),
      makeEntry({ agent: 'manager' }), // duplicate
    ];
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries,
      decisions: [],
      baseDir: tmpDir,
    });
    const content = await fs.readFile(result!, 'utf-8');
    expect(content).toContain('agents: [manager, implementer]');
  });

  it('returns file path on success', async () => {
    const result = await generateRunNarrative({
      runDir: tmpDir,
      runId: 'test-run',
      entries: [makeEntry()],
      decisions: [],
      baseDir: tmpDir,
    });
    expect(result).toBe(path.join(tmpDir, 'run-narrative.md'));
    // File should exist
    const stat = await fs.stat(result!);
    expect(stat.isFile()).toBe(true);
  });
});
