import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const mergerPrompt = readFileSync(join(__dirname, '../../prompts/merger.md'), 'utf-8');

describe('Merger prompt — parallel merge', () => {
  it('contains ARCHIVE parallel-merge section', () => {
    expect(mergerPrompt).toContain('<!-- ARCHIVE: parallel-merge -->');
    expect(mergerPrompt).toContain('<!-- /ARCHIVE: parallel-merge -->');
  });

  it('mentions merge_task_branch', () => {
    expect(mergerPrompt).toContain('merge_task_branch');
  });
});
