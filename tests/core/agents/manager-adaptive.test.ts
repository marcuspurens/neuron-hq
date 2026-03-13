import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';

// Mock sub-agents to prevent real instantiation
vi.mock('../../../src/core/agents/implementer.js', () => ({
  ImplementerAgent: vi.fn().mockImplementation(() => ({ run: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('../../../src/core/agents/reviewer.js', () => ({
  ReviewerAgent: vi.fn().mockImplementation(() => ({ run: vi.fn().mockResolvedValue(undefined) })),
}));

// Mock run-statistics to control getBeliefs and classifyBrief
vi.mock('../../../src/core/run-statistics.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getBeliefs: vi.fn().mockResolvedValue([]),
    classifyBrief: vi.fn().mockResolvedValue('feature' as const),
  };
});

import { ManagerAgent } from '../../../src/core/agents/manager.js';
import { createPolicyEnforcer } from '../../../src/core/policy.js';
import { getBeliefs, classifyBrief } from '../../../src/core/run-statistics.js';
import type { RunBelief } from '../../../src/core/run-statistics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

function createMockContext(
  policy: any,
  runDir: string,
  workspaceDir: string,
  auditLogFn: (...args: any[]) => Promise<void> = async () => {},
) {
  return {
    runid: '20260222-1200-test' as any,
    target: { name: 'test-target', path: '/tmp/test-target', default_branch: 'main' },
    hours: 1,
    workspaceDir,
    runDir,
    policy,
    audit: { log: auditLogFn },
    manifest: { addCommand: async () => {} },
    usage: { recordTokens: () => {}, recordToolCall: () => {} },
    artifacts: { readBrief: async () => '# Brief\n\nTest brief.' },
    startTime: new Date(),
    endTime: new Date(Date.now() + 3_600_000),
  } as any;
}

function makeBelief(
  dimension: string,
  confidence: number,
  totalRuns = 10,
  successes = 5,
): RunBelief {
  return {
    dimension,
    confidence,
    total_runs: totalRuns,
    successes,
    last_updated: '2026-01-01T00:00:00Z',
  };
}

describe('ManagerAgent — adaptive hints integration', () => {
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;
  let workspaceDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'manager-adaptive-test-'));
    runDir = path.join(tmpDir, 'runs', '20260222-1200-test');
    workspaceDir = path.join(tmpDir, 'workspace');
    await fs.mkdir(runDir, { recursive: true });
    await fs.mkdir(workspaceDir, { recursive: true });

    // Reset mocks before each test
    vi.mocked(getBeliefs).mockReset().mockResolvedValue([]);
    vi.mocked(classifyBrief).mockReset().mockResolvedValue('feature' as const);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('buildSystemPrompt() includes adaptive hints when beliefs exist', async () => {
    const beliefs: RunBelief[] = [
      makeBelief('agent:researcher', 0.40, 10, 4),
      makeBelief('agent:implementer', 0.92, 20, 18),
    ];
    vi.mocked(getBeliefs).mockResolvedValue(beliefs);
    vi.mocked(classifyBrief).mockResolvedValue('feature' as const);

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    expect(prompt).toContain('Adaptive Performance Hints');
    expect(prompt).toContain('Researcher has low success rate');
  });

  it('buildSystemPrompt() works without database (graceful degradation)', async () => {
    vi.mocked(getBeliefs).mockResolvedValue([]);

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    expect(prompt).not.toContain('Adaptive Performance Hints');
    expect(prompt).toContain('Run Context');
  });

  it('audit logging occurs when hints are generated', async () => {
    const beliefs: RunBelief[] = [
      makeBelief('agent:researcher', 0.40, 10, 4),
    ];
    vi.mocked(getBeliefs).mockResolvedValue(beliefs);
    vi.mocked(classifyBrief).mockResolvedValue('feature' as const);

    const auditSpy = vi.fn(async () => {});
    const ctx = createMockContext(policy, runDir, workspaceDir, auditSpy);
    const agent = new ManagerAgent(ctx, BASE_DIR);

    await (agent as any).buildSystemPrompt();

    const adaptiveCall = auditSpy.mock.calls.find(
      (call: any[]) => call[0]?.tool === 'adaptive_hints',
    );
    expect(adaptiveCall).toBeDefined();
    expect(adaptiveCall![0].allowed).toBe(true);
    expect(adaptiveCall![0].note).toContain('1 warnings');
  });

  it('gracefully degrades when getBeliefs throws', async () => {
    vi.mocked(getBeliefs).mockRejectedValue(new Error('DB connection failed'));

    const agent = new ManagerAgent(createMockContext(policy, runDir, workspaceDir), BASE_DIR);
    const prompt = await (agent as any).buildSystemPrompt();

    expect(prompt).not.toContain('Adaptive Performance Hints');
    expect(prompt).toContain('Run Context');
  });
});
