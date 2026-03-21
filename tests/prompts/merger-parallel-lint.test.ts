import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const mergerPrompt = readFileSync(join(__dirname, '../../prompts/merger.md'), 'utf-8');

describe('Merger prompt — safety gates', () => {
  it('requires MERGER: APPROVED exact match for execute phase', () => {
    expect(mergerPrompt).toContain('MERGER: APPROVED');
  });

  it('includes divergence decision matrix', () => {
    expect(mergerPrompt).toContain('Divergence decision matrix');
    expect(mergerPrompt).toContain('MERGER_BLOCKED');
  });

  it('includes idempotency check in EXECUTE phase', () => {
    expect(mergerPrompt).toContain('Idempotency check');
    expect(mergerPrompt).toContain('MERGER_ALREADY_COMPLETE');
  });

  it('requires branch isolation to swarm/<runid>', () => {
    expect(mergerPrompt).toContain('swarm/<runid>');
    expect(mergerPrompt).toMatch(/never directly to main/i);
  });

  it('includes cleanup of partial copies on failure', () => {
    expect(mergerPrompt).toContain('git checkout -- <already-copied-files>');
  });

  it('includes TOCTOU re-verification in EXECUTE', () => {
    expect(mergerPrompt).toMatch(/re-run the divergence check/i);
  });

  it('includes MERGER_REVERTED status code', () => {
    expect(mergerPrompt).toContain('MERGER_REVERTED');
  });
});
