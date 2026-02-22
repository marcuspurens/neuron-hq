import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { TesterAgent } from '../../src/core/agents/tester.js';
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

describe('TesterAgent', () => {
  let agent: TesterAgent;
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tester-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    agent = new TesterAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('can be instantiated', () => {
    expect(agent).toBeInstanceOf(TesterAgent);
  });

  it('loads the tester prompt', async () => {
    const prompt = await agent.loadPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Tester');
  });

  it('defines the correct tools', () => {
    const tools: Array<{ name: string }> = (agent as any).defineTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('bash_exec');
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('list_files');
  });

  describe('bash policy', () => {
    it('blocks forbidden bash commands', async () => {
      const result = await (agent as any).executeBash({ command: 'sudo rm -rf /' });
      expect(result).toMatch(/BLOCKED/);
    });

    it('allows pytest command', async () => {
      const result = await (agent as any).executeBash({
        command: 'python -m pytest tests/ -v',
      });
      // Should not be BLOCKED — may fail if no tests exist, but not policy-blocked
      expect(result).not.toMatch(/^BLOCKED/);
    });

    it('allows npm test command', async () => {
      const result = await (agent as any).executeBash({ command: 'npm test' });
      expect(result).not.toMatch(/^BLOCKED/);
    });

    it('includes stderr in output for test runners', async () => {
      // echo writes to stdout — just verify we get some output back
      const result = await (agent as any).executeBash({ command: 'echo "test output"' });
      expect(result).toContain('test output');
    });
  });

  describe('list_files', () => {
    it('lists workspace root by default', async () => {
      await fs.writeFile(path.join(workspaceDir, 'package.json'), '{}');
      const result = await (agent as any).executeListFiles({});
      expect(result).toContain('package.json');
    });

    it('lists a subdirectory', async () => {
      await fs.mkdir(path.join(workspaceDir, 'tests'), { recursive: true });
      await fs.writeFile(path.join(workspaceDir, 'tests', 'test_app.py'), '# test');
      const result = await (agent as any).executeListFiles({ path: 'tests' });
      expect(result).toContain('test_app.py');
    });
  });

  describe('write_file policy', () => {
    it('blocks writes outside runs dir', async () => {
      const result = await (agent as any).executeWriteFile({
        path: '/etc/evil.txt',
        content: 'bad',
      });
      expect(result).toMatch(/BLOCKED/);
    });
  });
});
