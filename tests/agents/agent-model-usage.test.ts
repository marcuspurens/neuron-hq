import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

const AGENT_FILES = [
  'manager.ts',
  'implementer.ts',
  'reviewer.ts',
  'researcher.ts',
  'merger.ts',
  'tester.ts',
  'historian.ts',
  'librarian.ts',
  'consolidator.ts',
  'brief-agent.ts',
];

const AGENTS_DIR = path.join(process.cwd(), 'src', 'core', 'agents');

describe('Agent model usage lint', () => {
  it('no agent imports @anthropic-ai/sdk as a value import', async () => {
    for (const file of AGENT_FILES) {
      const content = await fs.readFile(path.join(AGENTS_DIR, file), 'utf-8');
      // Allow "import type Anthropic" but not "import Anthropic" (value import)
      const valueImportLines = content
        .split('\n')
        .filter(line =>
          line.includes("from '@anthropic-ai/sdk'") &&
          !line.includes('import type')
        );
      expect(
        valueImportLines,
        `${file} should not have value import from @anthropic-ai/sdk. Found: ${valueImportLines.join(', ')}`
      ).toHaveLength(0);
    }
  });

  it('no agent has hardcoded claude-opus-4-6', async () => {
    for (const file of AGENT_FILES) {
      const content = await fs.readFile(path.join(AGENTS_DIR, file), 'utf-8');
      expect(
        content.includes("'claude-opus-4-6'"),
        `${file} should not have hardcoded 'claude-opus-4-6'`
      ).toBe(false);
    }
  });

  it('all agents call resolveModelConfig', async () => {
    for (const file of AGENT_FILES) {
      const content = await fs.readFile(path.join(AGENTS_DIR, file), 'utf-8');
      expect(
        content.includes('resolveModelConfig'),
        `${file} should call resolveModelConfig`
      ).toBe(true);
    }
  });

  it('all agents call createAgentClient', async () => {
    for (const file of AGENT_FILES) {
      const content = await fs.readFile(path.join(AGENTS_DIR, file), 'utf-8');
      expect(
        content.includes('createAgentClient'),
        `${file} should call createAgentClient`
      ).toBe(true);
    }
  });

  it('no agent creates new Anthropic() directly', async () => {
    for (const file of AGENT_FILES) {
      const content = await fs.readFile(path.join(AGENTS_DIR, file), 'utf-8');
      expect(
        content.includes('new Anthropic('),
        `${file} should not create new Anthropic() directly`
      ).toBe(false);
    }
  });
});
