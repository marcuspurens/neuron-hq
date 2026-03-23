import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { ManagerAgent } from '../../src/core/agents/manager.js';
import { createPolicyEnforcer } from '../../src/core/policy.js';

vi.mock('../../src/core/agents/implementer.js', () => ({
  ImplementerAgent: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../src/core/agents/reviewer.js', () => ({
  ReviewerAgent: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue(undefined),
  })),
}));

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
      expect(names).toContain('delegate_to_tester');
      expect(names).toContain('delegate_to_librarian');
    });
  });

  describe('buildSystemPrompt — runDir context', () => {
    it('includes runDir in the system prompt', async () => {
      const prompt = await (agent as any).buildSystemPrompt();
      expect(prompt).toContain('Run artifacts dir');
      expect(prompt).toContain(runDir);
    });

    it('runDir in the prompt is an absolute path', async () => {
      const prompt = await (agent as any).buildSystemPrompt();
      const match = prompt.match(/Run artifacts dir\*\*: (.+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/^\//);
    });

    it('includes workspace dir in the system prompt', async () => {
      const prompt = await (agent as any).buildSystemPrompt();
      expect(prompt).toContain('Workspace');
      expect(prompt).toContain(workspaceDir);
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

  describe('delegateToImplementer handoff', () => {
    it('includes handoff content when implementer_handoff.md exists', async () => {
      const handoffContent = '### Vad gjordes\n- Changed foo.ts\n\n### Risker\n- Edge case X';
      await fs.writeFile(path.join(runDir, 'implementer_handoff.md'), handoffContent);

      const result = await (agent as any).delegateToImplementer({ task: 'test task' });
      expect(result).toContain('IMPLEMENTER HANDOFF');
      expect(result).toContain('Vad gjordes');
      expect(result).toContain('Edge case X');
    });

    it('returns graceful fallback when implementer_handoff.md is missing', async () => {
      const result = await (agent as any).delegateToImplementer({ task: 'test task' });
      expect(result).toContain('No handoff written');
    });
  });

  describe('structured result parsing', () => {
    it('reads implementer_result.json when available', async () => {
      const validResult = {
        taskId: 'T1',
        filesModified: [{ path: 'src/foo.ts', reason: 'Added feature' }],
        decisions: [],
        risks: ['Edge case'],
        notDone: [],
        confidence: 'HIGH',
        testsPassing: true,
      };
      await fs.writeFile(
        path.join(runDir, 'implementer_result.json'),
        JSON.stringify(validResult),
      );
      await fs.writeFile(
        path.join(runDir, 'implementer_handoff.md'),
        '## Self-Check\nConfidence: HIGH',
      );
      const result = await (agent as any).delegateToImplementer({ task: 'test task' });
      expect(result).toContain('STRUCTURED RESULT');
      expect(result).toContain('Confidence: HIGH');
    });

    it('falls back to markdown when implementer_result.json missing', async () => {
      await fs.writeFile(
        path.join(runDir, 'implementer_handoff.md'),
        '## Self-Check\nConfidence: MEDIUM',
      );
      const result = await (agent as any).delegateToImplementer({ task: 'test task' });
      expect(result).toContain('IMPLEMENTER HANDOFF');
      expect(result).not.toContain('STRUCTURED RESULT');
    });

    it('falls back to markdown when implementer_result.json is invalid', async () => {
      await fs.writeFile(
        path.join(runDir, 'implementer_result.json'),
        JSON.stringify({ taskId: 'T1' }),
      );
      await fs.writeFile(
        path.join(runDir, 'implementer_handoff.md'),
        '## Self-Check\nConfidence: MEDIUM',
      );
      const result = await (agent as any).delegateToImplementer({ task: 'test task' });
      expect(result).toContain('IMPLEMENTER HANDOFF');
      expect(result).not.toContain('STRUCTURED RESULT');
    });

    it('reads reviewer_result.json when available', async () => {
      const validResult = {
        verdict: 'GREEN',
        testsRun: 50,
        testsPassing: 50,
        acceptanceCriteria: [{ criterion: 'Tests pass', passed: true }],
        blockers: [],
        suggestions: [],
      };
      await fs.writeFile(
        path.join(runDir, 'reviewer_result.json'),
        JSON.stringify(validResult),
      );
      await fs.writeFile(
        path.join(runDir, 'reviewer_handoff.md'),
        '## Self-Check\nTests run: YES\nAcceptance criteria checked: 1/1',
      );
      const result = await (agent as any).delegateToReviewer();
      expect(result).toContain('STRUCTURED RESULT');
      expect(result).toContain('Verdict: GREEN');
    });

    it('falls back to markdown when reviewer_result.json missing', async () => {
      await fs.writeFile(
        path.join(runDir, 'reviewer_handoff.md'),
        '## Self-Check\nTests run: YES\nAcceptance criteria checked: 5/5',
      );
      const result = await (agent as any).delegateToReviewer();
      expect(result).toContain('REVIEWER HANDOFF');
      expect(result).not.toContain('STRUCTURED RESULT');
    });

    it('logs agent_message audit entry for implementer', async () => {
      const auditEntries: any[] = [];
      const mockCtx = createMockContext(policy, runDir, workspaceDir);
      mockCtx.audit = { log: async (entry: any) => { auditEntries.push(entry); } };
      const testAgent = new ManagerAgent(mockCtx, BASE_DIR);
      (testAgent as any).memoryDir = memoryDir;

      const validResult = {
        taskId: 'T1',
        filesModified: [],
        decisions: [],
        risks: [],
        notDone: [],
        confidence: 'HIGH',
        testsPassing: true,
      };
      await fs.writeFile(path.join(runDir, 'implementer_result.json'), JSON.stringify(validResult));
      await fs.writeFile(path.join(runDir, 'implementer_handoff.md'), '## Self-Check\nConfidence: HIGH');

      await (testAgent as any).delegateToImplementer({ task: 'test task' });

      const agentMsgEntries = auditEntries.filter(e => e.tool === 'agent_message');
      expect(agentMsgEntries.length).toBeGreaterThan(0);
      const parsed = JSON.parse(agentMsgEntries[0].note);
      expect(parsed.event).toBe('agent_message');
      expect(parsed.from).toBe('implementer');
      expect(parsed.payload_type).toBe('ImplementerResult');
    });
  });
});
