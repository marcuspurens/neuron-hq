import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { MergerAgent } from '../../src/core/agents/merger.js';
import { createPolicyEnforcer } from '../../src/core/policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

function createMockContext(
  policy: Awaited<ReturnType<typeof createPolicyEnforcer>>,
  runDir: string,
  workspaceDir: string,
  targetPath: string
) {
  return {
    runid: '20260222-1200-test' as any,
    target: { name: 'test-target', path: targetPath, default_branch: 'main' },
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

describe('MergerAgent', () => {
  let agent: MergerAgent;
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;
  let targetDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'merger-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    targetDir = path.join(tmpDir, 'target');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });

    agent = new MergerAgent(createMockContext(policy, runDir, workspaceDir, targetDir), BASE_DIR);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('can be instantiated', () => {
    expect(agent).toBeInstanceOf(MergerAgent);
  });

  it('loads the merger prompt', async () => {
    const prompt = await agent.loadPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Merger');
  });

  it('defines the correct tools', () => {
    const tools: Array<{ name: string }> = (agent as any).defineTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('bash_exec');
    expect(names).toContain('bash_exec_in_target');
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('copy_to_target');
  });

  describe('phase detection', () => {
    it('returns plan phase when answers.md does not exist', async () => {
      const phase = await agent.detectPhase();
      expect(phase).toBe('plan');
    });

    it('returns plan phase when answers.md exists without APPROVED', async () => {
      await fs.writeFile(path.join(runDir, 'answers.md'), 'No, cancel this.');
      const phase = await agent.detectPhase();
      expect(phase).toBe('plan');
    });

    it('returns execute phase when answers.md contains APPROVED', async () => {
      await fs.writeFile(path.join(runDir, 'answers.md'), 'APPROVED');
      const phase = await agent.detectPhase();
      expect(phase).toBe('execute');
    });

    it('returns execute phase when APPROVED is lowercase', async () => {
      await fs.writeFile(path.join(runDir, 'answers.md'), 'approved — go ahead');
      const phase = await agent.detectPhase();
      expect(phase).toBe('execute');
    });

    it('returns execute phase when answers.md is in workspace (fallback)', async () => {
      await fs.writeFile(path.join(workspaceDir, 'answers.md'), 'APPROVED');
      const phase = await agent.detectPhase();
      expect(phase).toBe('execute');
    });

    it('returns plan when neither runDir nor workspace answers.md contains APPROVED', async () => {
      await fs.writeFile(path.join(runDir, 'answers.md'), 'No, reject this.');
      await fs.writeFile(path.join(workspaceDir, 'answers.md'), 'Pending review.');
      const phase = await agent.detectPhase();
      expect(phase).toBe('plan');
    });
  });

  describe('bash policy', () => {
    it('blocks forbidden bash commands', async () => {
      const result = await (agent as any).executeBash({ command: 'sudo rm -rf /' });
      expect(result).toMatch(/BLOCKED/);
    });

    it('blocks forbidden bash commands in target', async () => {
      const result = await (agent as any).executeBashInTarget({ command: 'sudo rm -rf /' });
      expect(result).toMatch(/BLOCKED/);
    });

    it('allows git status in workspace', async () => {
      const result = await (agent as any).executeBash({ command: 'git status' });
      expect(result).not.toMatch(/BLOCKED/);
    });

    it('allows git commit in target', async () => {
      // Will fail (no git repo) but must not be BLOCKED
      const result = await (agent as any).executeBashInTarget({
        command: 'git commit -m "test"',
      });
      expect(result).not.toMatch(/BLOCKED/);
    });
  });

  describe('copy_to_target safety', () => {
    it('blocks copy from outside workspace', async () => {
      const result = await agent.executeCopyToTarget({
        workspace_path: '/etc/passwd',
        target_path: 'etc/passwd',
      });
      expect(result).toMatch(/BLOCKED/);
    });

    it('blocks copy to outside target repo', async () => {
      // Create a file in workspace to copy
      await fs.writeFile(path.join(workspaceDir, 'src', 'app.py').replace('/src/', '/'), 'test');
      const result = await agent.executeCopyToTarget({
        workspace_path: 'app.py',
        target_path: '/tmp/evil.py',
      });
      expect(result).toMatch(/BLOCKED/);
    });

    it('successfully copies a file from workspace to target', async () => {
      await fs.writeFile(path.join(workspaceDir, 'app.py'), 'print("hello")');
      const result = await agent.executeCopyToTarget({
        workspace_path: 'app.py',
        target_path: 'app.py',
      });
      expect(result).toMatch(/Copied/);
      const content = await fs.readFile(path.join(targetDir, 'app.py'), 'utf-8');
      expect(content).toBe('print("hello")');
    });

    it('creates parent directories when copying to nested target path', async () => {
      await fs.mkdir(path.join(workspaceDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(workspaceDir, 'src', 'module.py'), 'x = 1');
      const result = await agent.executeCopyToTarget({
        workspace_path: 'src/module.py',
        target_path: 'src/module.py',
      });
      expect(result).toMatch(/Copied/);
      const content = await fs.readFile(path.join(targetDir, 'src', 'module.py'), 'utf-8');
      expect(content).toBe('x = 1');
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
