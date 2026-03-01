import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const managerPrompt = readFileSync(join(__dirname, '../../prompts/manager.md'), 'utf-8');

describe('Manager prompt — parallel tasks', () => {
  it('contains ARCHIVE parallel-tasks section', () => {
    expect(managerPrompt).toContain('<!-- ARCHIVE: parallel-tasks -->');
    expect(managerPrompt).toContain('<!-- /ARCHIVE: parallel-tasks -->');
  });

  it('mentions Parallel Task Execution', () => {
    expect(managerPrompt).toContain('Parallel Task Execution');
  });
});
