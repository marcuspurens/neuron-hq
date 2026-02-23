import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { HistorianAgent } from '../../src/core/agents/historian.js';
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

describe('HistorianAgent', () => {
  let agent: HistorianAgent;
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;
  let memoryDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'historian-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    memoryDir = path.join(tmpDir, 'memory');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    agent = new HistorianAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    // Override memoryDir to use temp location
    (agent as any).memoryDir = memoryDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('can be instantiated', () => {
    expect(agent).toBeInstanceOf(HistorianAgent);
  });

  it('loads the historian prompt', async () => {
    const prompt = await agent.loadPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Historian');
  });

  it('defines the correct tools', () => {
    const tools: Array<{ name: string }> = (agent as any).defineTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('read_file');
    expect(names).toContain('read_memory_file');
    expect(names).toContain('write_to_memory');
    expect(names).toContain('search_memory');
    expect(names).toContain('update_error_status');
  });

  it('does not define deprecated append_to_swarm_log tool', () => {
    const tools: Array<{ name: string }> = (agent as any).defineTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('append_to_swarm_log');
  });

  describe('write_to_memory', () => {
    it('creates runs.md with header if it does not exist', async () => {
      await agent.executeWriteToMemory({
        file: 'runs',
        entry: '## Körning 20260222-1200-test — test-target\n**Datum:** 2026-02-22\n\n---',
      });

      const content = await fs.readFile(path.join(memoryDir, 'runs.md'), 'utf-8');
      expect(content).toContain('# Runs');
      expect(content).toContain('Körning 20260222-1200-test');
    });

    it('creates patterns.md with header if it does not exist', async () => {
      await agent.executeWriteToMemory({
        file: 'patterns',
        entry: '## Kompakt testutdata\n**Kontext:** Test\n**Lösning:** Foo\n**Effekt:** Bar\n\n---',
      });

      const content = await fs.readFile(path.join(memoryDir, 'patterns.md'), 'utf-8');
      expect(content).toContain('# Patterns');
      expect(content).toContain('Kompakt testutdata');
    });

    it('creates errors.md with header if it does not exist', async () => {
      await agent.executeWriteToMemory({
        file: 'errors',
        entry: '## Context overflow\n**Session:** test\n**Symptom:** Krasch\n\n---',
      });

      const content = await fs.readFile(path.join(memoryDir, 'errors.md'), 'utf-8');
      expect(content).toContain('# Errors');
      expect(content).toContain('Context overflow');
    });

    it('appends to existing runs.md without overwriting', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'runs.md'),
        '# Runs\n\n## Körning gammal — target\n\n---\n'
      );

      await agent.executeWriteToMemory({
        file: 'runs',
        entry: '## Körning ny — test-target\n**Datum:** 2026-02-22\n\n---',
      });

      const content = await fs.readFile(path.join(memoryDir, 'runs.md'), 'utf-8');
      expect(content).toContain('Körning gammal');
      expect(content).toContain('Körning ny');
    });

    it('returns success message with correct file name', async () => {
      const result = await agent.executeWriteToMemory({
        file: 'runs',
        entry: '## Test entry\n\n---',
      });

      expect(result).toContain('memory/runs.md');
    });

    it('returns error for invalid file name', async () => {
      const result = await agent.executeWriteToMemory({
        file: 'invalid' as any,
        entry: '## Test\n\n---',
      });

      expect(result).toContain('Error');
      expect(result).toContain('invalid');
    });

    it('can write to all three valid files independently', async () => {
      await agent.executeWriteToMemory({ file: 'runs', entry: '## Run entry\n\n---' });
      await agent.executeWriteToMemory({ file: 'patterns', entry: '## Pattern entry\n\n---' });
      await agent.executeWriteToMemory({ file: 'errors', entry: '## Error entry\n\n---' });

      const runsContent = await fs.readFile(path.join(memoryDir, 'runs.md'), 'utf-8');
      const patternsContent = await fs.readFile(path.join(memoryDir, 'patterns.md'), 'utf-8');
      const errorsContent = await fs.readFile(path.join(memoryDir, 'errors.md'), 'utf-8');

      expect(runsContent).toContain('Run entry');
      expect(patternsContent).toContain('Pattern entry');
      expect(errorsContent).toContain('Error entry');
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
  });

  describe('search_memory', () => {
    it('returns matches when query exists in a memory file', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'errors.md'),
        '# Errors\n\n## Context overflow\n**Session:** test\n**Symptom:** Krasch vid context overflow\n\n---\n'
      );

      const result = await (agent as any).executeSearchMemory({ query: 'context overflow' });
      expect(result).toContain('Context overflow');
    });

    it('returns no-matches message when query does not exist', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(path.join(memoryDir, 'runs.md'), '# Runs\n\n## Körning test\n\n---\n');

      const result = await (agent as any).executeSearchMemory({ query: 'nonexistent-xyz-query' });
      expect(result).toContain('No matches found');
    });

    it('searches across multiple memory files', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'patterns.md'),
        '# Patterns\n\n## Streaming pattern\n**Kontext:** streaming\n\n---\n'
      );
      await fs.writeFile(
        path.join(memoryDir, 'errors.md'),
        '# Errors\n\n## Streaming bugg\n**Session:** test\n**Symptom:** streaming krasch\n\n---\n'
      );

      const result = await (agent as any).executeSearchMemory({ query: 'streaming' });
      expect(result).toContain('patterns.md');
      expect(result).toContain('errors.md');
    });

    it('is case-insensitive', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(
        path.join(memoryDir, 'runs.md'),
        '# Runs\n\n## Körning test\n**Uppgift:** AURORA target fix\n\n---\n'
      );

      const result = await (agent as any).executeSearchMemory({ query: 'aurora' });
      expect(result).toContain('AURORA');
    });

    it('returns empty result gracefully when no memory files exist', async () => {
      // memoryDir doesn't exist yet
      const result = await (agent as any).executeSearchMemory({ query: 'anything' });
      expect(result).toContain('No matches found');
    });
  });

  describe('update_error_status', () => {
    const errorsContent = `# Errors\n\n## Context overflow i Tester-agenten\n**Session:** 11\n**Symptom:** Krasch\n**Status:** ⚠️ Identifierat\n\n---\n\n## Annat fel\n**Session:** 12\n**Status:** ✅ Löst\n\n---\n`;

    it('updates Status line of matching section in place', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(path.join(memoryDir, 'errors.md'), errorsContent);

      const result = await (agent as any).executeUpdateErrorStatus({
        title: 'Context overflow i Tester-agenten',
        new_status: '✅ Löst — fixed in run #12',
      });

      expect(result).toContain('Updated status');
      const updated = await fs.readFile(path.join(memoryDir, 'errors.md'), 'utf-8');
      expect(updated).toContain('**Status:** ✅ Löst — fixed in run #12');
      expect(updated).not.toContain('**Status:** ⚠️ Identifierat');
    });

    it('does not modify other sections', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(path.join(memoryDir, 'errors.md'), errorsContent);

      await (agent as any).executeUpdateErrorStatus({
        title: 'Context overflow i Tester-agenten',
        new_status: '✅ Löst',
      });

      const updated = await fs.readFile(path.join(memoryDir, 'errors.md'), 'utf-8');
      expect(updated).toContain('## Annat fel');
      expect(updated).toContain('**Status:** ✅ Löst\n');
    });

    it('returns error when section title not found', async () => {
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(path.join(memoryDir, 'errors.md'), errorsContent);

      const result = await (agent as any).executeUpdateErrorStatus({
        title: 'Nonexistent section',
        new_status: '✅ Löst',
      });

      expect(result).toContain('Error');
      expect(result).toContain('Nonexistent section');
    });

    it('returns error when errors.md does not exist', async () => {
      const result = await (agent as any).executeUpdateErrorStatus({
        title: 'Any title',
        new_status: '✅ Löst',
      });

      expect(result).toContain('Error');
      expect(result).toContain('errors.md not found');
    });
  });

  describe('read_file', () => {
    it('returns file content when file exists', async () => {
      await fs.writeFile(path.join(runDir, 'report.md'), '# Report\n\n✅ All good.');
      const result = await (agent as any).executeReadFile({
        path: path.join(runDir, 'report.md'),
      });
      expect(result).toContain('All good');
    });

    it('returns not-found message when file is missing', async () => {
      const result = await (agent as any).executeReadFile({
        path: path.join(runDir, 'nonexistent.md'),
      });
      expect(result).toContain('not found');
    });
  });
});
