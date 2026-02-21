import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { ReviewerAgent } from '../../src/core/agents/reviewer.js';
import { createPolicyEnforcer } from '../../src/core/policy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

function createMockContext(policy: Awaited<ReturnType<typeof createPolicyEnforcer>>) {
  return {
    runid: '20260221-1200-test' as any,
    target: { name: 'test-target', path: '/tmp/test', default_branch: 'main' },
    hours: 1,
    workspaceDir: '/tmp/workspace',
    runDir: '/tmp/runs/20260221-1200-test',
    policy,
    audit: { log: async () => {} },
    manifest: { addCommand: async () => {} },
    usage: { recordTokens: () => {}, recordToolCall: () => {} },
    artifacts: { readBrief: async () => '# Brief\n\nTest brief.' },
    startTime: new Date(),
    endTime: new Date(Date.now() + 3_600_000),
  } as any;
}

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;

  beforeAll(async () => {
    const policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
    agent = new ReviewerAgent(createMockContext(policy), BASE_DIR);
  });

  it('can be instantiated', () => {
    expect(agent).toBeInstanceOf(ReviewerAgent);
  });

  it('loads the reviewer prompt', async () => {
    const prompt = await agent.loadPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain('Reviewer');
  });

  it('defines the correct tools', () => {
    const tools: Array<{ name: string }> = (agent as any).defineTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('bash_exec');
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('list_files');
  });

  it('blocks forbidden bash commands', async () => {
    const result = await (agent as any).executeBash({ command: 'sudo rm -rf /' });
    expect(result).toMatch(/BLOCKED/);
  });

  it('allows git status command', async () => {
    const result = await (agent as any).executeBash({ command: 'git status' });
    // Should not be BLOCKED — may fail if no git repo at /tmp/workspace, but not policy-blocked
    expect(result).not.toMatch(/BLOCKED/);
  });

  it('blocks file writes outside allowed scope', async () => {
    const result = await (agent as any).executeWriteFile({
      path: '/etc/malicious.txt',
      content: 'test',
    });
    expect(result).toMatch(/BLOCKED/);
  });
});
