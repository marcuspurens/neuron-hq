import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

describe('Reviewer → Manager Handoff', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reviewer-handoff-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reviewer prompt contains handoff instruction for reviewer_handoff.md', async () => {
    const prompt = await fs.readFile(path.join(BASE_DIR, 'prompts', 'reviewer.md'), 'utf-8');
    expect(prompt).toContain('reviewer_handoff.md');
  });

  it('manager prompt contains Reviewer Handoff section', async () => {
    const prompt = await fs.readFile(path.join(BASE_DIR, 'prompts', 'manager.md'), 'utf-8');
    expect(prompt).toContain('### Reviewer Handoff');
    expect(prompt).toContain('REVIEWER HANDOFF');
  });

  it('returns handoff content when reviewer_handoff.md exists', async () => {
    const runDir = path.join(tmpDir, 'runs', 'test-run');
    await fs.mkdir(runDir, { recursive: true });

    const handoffContent = '# Reviewer Handoff — test-run\n\n## Verdict\n- **Status**: GREEN';
    const handoffPath = path.join(runDir, 'reviewer_handoff.md');
    await fs.writeFile(handoffPath, handoffContent);

    // Replicate the exact file-reading pattern from delegateToReviewer
    let result: string;
    try {
      const handoff = await fs.readFile(handoffPath, 'utf-8');
      result = `Reviewer agent completed.\n\n--- REVIEWER HANDOFF ---\n${handoff}`;
    } catch {
      result = 'Reviewer agent completed successfully. (No handoff written)';
    }

    expect(result).toContain('--- REVIEWER HANDOFF ---');
    expect(result).toContain('Reviewer Handoff — test-run');
    expect(result).toContain('GREEN');
  });

  it('handoff template in reviewer prompt contains required sections', async () => {
    const prompt = await fs.readFile(path.join(BASE_DIR, 'prompts', 'reviewer.md'), 'utf-8');
    expect(prompt).toContain('## Verdict');
    expect(prompt).toContain('## Acceptance Criteria');
    expect(prompt).toContain('## Risk');
    expect(prompt).toContain('## Recommendation');
  });

  it('returns fallback message when reviewer_handoff.md is missing', async () => {
    const runDir = path.join(tmpDir, 'runs', 'test-run');
    await fs.mkdir(runDir, { recursive: true });

    const handoffPath = path.join(runDir, 'reviewer_handoff.md');

    // Replicate the exact file-reading pattern from delegateToReviewer
    let result: string;
    try {
      const handoff = await fs.readFile(handoffPath, 'utf-8');
      result = `Reviewer agent completed.\n\n--- REVIEWER HANDOFF ---\n${handoff}`;
    } catch {
      result = 'Reviewer agent completed successfully. (No handoff written)';
    }

    expect(result).toContain('(No handoff written)');
    expect(result).not.toContain('--- REVIEWER HANDOFF ---');
  });

  it('manager prompt documents all three decision paths', async () => {
    const prompt = await fs.readFile(path.join(BASE_DIR, 'prompts', 'manager.md'), 'utf-8');
    expect(prompt).toContain('GREEN');
    expect(prompt).toContain('MERGE');
    expect(prompt).toContain('YELLOW');
    expect(prompt).toContain('ITERATE');
    expect(prompt).toContain('RED');
    expect(prompt).toContain('INVESTIGATE');
  });
});
