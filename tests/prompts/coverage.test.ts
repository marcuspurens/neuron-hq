import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const promptsDir = join(__dirname, '../../prompts');
const testsDir = __dirname;

describe('prompt lint coverage', () => {
  it('every prompts/*.md has a corresponding *-lint.test.ts', () => {
    const promptFiles = readdirSync(promptsDir).filter(f => f.endsWith('.md'));
    const missing: string[] = [];

    for (const promptFile of promptFiles) {
      const base = promptFile.replace('.md', '');
      const lintTestFile = join(testsDir, `${base}-lint.test.ts`);
      if (!existsSync(lintTestFile)) {
        missing.push(promptFile);
      }
    }

    expect(missing, `These prompts lack lint tests: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('has at least 7 prompt files guarded', () => {
    const promptFiles = readdirSync(promptsDir).filter(f => f.endsWith('.md'));
    expect(promptFiles.length).toBeGreaterThanOrEqual(7);
  });

  it('has at least 7 lint test files', () => {
    const lintTests = readdirSync(testsDir).filter(f => f.endsWith('-lint.test.ts'));
    expect(lintTests.length).toBeGreaterThanOrEqual(7);
  });
});
