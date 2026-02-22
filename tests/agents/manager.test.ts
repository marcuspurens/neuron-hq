import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { ManagerAgent } from '../../src/core/agents/manager.js';
import { createPolicyEnforcer } from '../../src/core/policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

function createMockContext(
  policy: Awaited<ReturnType<typeof createPolicyEnforcer>>,
  runDir: string,
  workspaceDir: string
) {
  return {
    runid: '20260222-1200-test' as any,
    target: { name: 'test-target', path: '/tmp/test-target', default_branch: 'main' },
    hours: 1,
    workspaceDir,
    runDir,
    policy,
    audit: { log: async () => {} },
    manifest: { addCommand: async () => {} },
    usage: { recordTokens: () => {}, recordToolCall: () => {} },
    artifacts: { readBrief: async () => '# Brief\n\nTest brief.' },
    startTime: new Date(),
    endTime: new Date(Date.now() + 3_600_000),
  } as any;
}

describe('ManagerAgent', () => {
  let agent: ManagerAgent;
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;
  let memoryDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manager-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    memoryDir = path.join(tmpDir, 'memory');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    // Override memoryDir to use temp location
    (agent as any).memoryDir = memoryDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('can be instantiated', () => {
    expect(agent).toBeInstanceOf(ManagerAgent);
  });

  it('loads the manager prompt', async () => {
    const prompt = await agent.loadPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Manager');
  });

  describe('defineTools', () => {
    it('includes read_memory_file tool', () => {
      const tools: Array<{ name: string }> = (agent as any).defineTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('read_memory_file');
    });

    it('includes search_memory tool', () => {
      const tools: Array<{ name: string }> = (agent as any).defineTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('search_memory');
    });

    it('includes all delegate tools', () => {
      const tools: Array<{ name: string }> = (agent as any).defineTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain('delegate_to_implementer');
      expect(names).toContain('delegate_to_reviewer');
      expect(names).toContain('delegate_to_researcher');
      expect(names).toContain('delegate_to_merger');
      expect(names).toContain('delegate_to_historian');
      expect(names).toContain('delegate_to_tester');
      expect(names).toContain('delegate_to_librarian');
    });
  });

  describe('search_memory', () => {
    it('returns no-match message when memory dir is empty', async () => {
      const result = await (agent as any).executeSearchMemory({ query: 'streaming' });
      expect(result).toContain('No matches found');
    });

    it('finds matching entries across memory files', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'patterns.md'),
        '# Patterns\n\n## Streaming Output\nText streams live.\n\n---\n'
      );
      await fs.writeFile(
        path.join(memoryDir, 'errors.md'),
        '# Errors\n\n## Context Overflow\nAgent crashed.\n\n---\n'
      );

      const result = await (agent as any).executeSearchMemory({ query: 'streaming' });
      expect(result).toContain('Streaming Output');
      expect(result).not.toContain('Context Overflow');
    });

    it('search is case-insensitive', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'techniques.md'),
        '# Techniques\n\n## MemGPT Paper\nMemory system.\n\n---\n'
      );

      const result = await (agent as any).executeSearchMemory({ query: 'memgpt' });
      expect(result).toContain('MemGPT Paper');
    });
  });

  describe('read_memory_file', () => {
    it('returns file content when memory file exists', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'techniques.md'),
        '# Techniques\n\n## Paper A\n\n---\n'
      );

      const result = await (agent as any).executeReadMemoryFile({ file: 'techniques' });
      expect(result).toContain('Paper A');
    });

    it('returns not-found message when memory file is missing', async () => {
      const result = await (agent as any).executeReadMemoryFile({ file: 'techniques' });
      expect(result).toContain('not found');
    });

    it('returns error for invalid memory file name', async () => {
      const result = await (agent as any).executeReadMemoryFile({ file: 'invalid' });
      expect(result).toContain('Error');
      expect(result).toContain('invalid');
    });

    it('can read runs, patterns, errors and techniques', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      for (const file of ['runs', 'patterns', 'errors', 'techniques']) {
        await fs.writeFile(
          path.join(memoryDir, `${file}.md`),
          `# ${file}\n\n## Entry\n\n---\n`
        );
        const result = await (agent as any).executeReadMemoryFile({ file });
        expect(result).toContain('Entry');
      }
    });
  });
});
