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
