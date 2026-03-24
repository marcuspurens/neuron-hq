import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { ObserverAgent } from '../../src/core/agents/observer.js';
import { eventBus } from '../../src/core/event-bus.js';
import { createPolicyEnforcer } from '../../src/core/policy.js';
import { calcCost, getModelShortName } from '../../src/core/pricing.js';
import { DEFAULT_MODEL_CONFIG } from '../../src/core/model-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

function createMockContext(
  policy: Awaited<ReturnType<typeof createPolicyEnforcer>>,
  runDir: string,
  workspaceDir = '/tmp/test-workspace',
) {
  return {
    runid: '20260322-0150-test' as any,
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

describe('ObserverAgent', () => {
  let observer: ObserverAgent;
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let tmpDir: string;
  let runDir: string;

  beforeAll(async () => {
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'observer-test-'));
    runDir = path.join(tmpDir, 'runs', '20260322-0150-test');
    await fs.mkdir(runDir, { recursive: true });
    const ctx = createMockContext(policy, runDir);
    observer = new ObserverAgent(ctx, BASE_DIR);
  });

  afterEach(async () => {
    // Reset eventBus onAny listeners to prevent cross-contamination
    (eventBus as any)._anyCallbacks?.clear();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── 1. Instantiation ──────────────────────────────────────

  describe('constructor', () => {
    it('should create an ObserverAgent without throwing', () => {
      expect(observer).toBeDefined();
      expect(observer).toBeInstanceOf(ObserverAgent);
    });
  });

  // ── 2. startObserving ─────────────────────────────────────

  describe('startObserving', () => {
    it('should load prompts and anti-patterns without throwing', async () => {
      await observer.startObserving();
      // If we got here without an error, loading succeeded
      expect(true).toBe(true);
    });

    it('should register onAny listener on eventBus', async () => {
      const sizeBefore = (eventBus as any)._anyCallbacks.size;
      await observer.startObserving();
      const sizeAfter = (eventBus as any)._anyCallbacks.size;
      expect(sizeAfter).toBe(sizeBefore + 1);
    });
  });

  // ── 3-5. Token handling ───────────────────────────────────

  describe('handleTokens', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('accumulates token usage correctly for a single agent', () => {
      eventBus.safeEmit('tokens', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        input: 1000,
        output: 500,
      });

      const usage = (observer as any).tokenUsage as Map<string, any>;
      const impl = usage.get('implementer');
      expect(impl).toBeDefined();
      expect(impl.inputTokens).toBe(1000);
      expect(impl.outputTokens).toBe(500);
      expect(impl.totalTokens).toBe(1500);
    });

    it('accumulates token usage across multiple events for same agent', () => {
      eventBus.safeEmit('tokens', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        input: 1000,
        output: 500,
      });
      eventBus.safeEmit('tokens', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        input: 2000,
        output: 1000,
      });

      const usage = (observer as any).tokenUsage as Map<string, any>;
      const impl = usage.get('implementer');
      expect(impl.inputTokens).toBe(3000);
      expect(impl.outputTokens).toBe(1500);
      expect(impl.totalTokens).toBe(4500);
    });

    it('handles multiple agents independently', () => {
      eventBus.safeEmit('tokens', {
        runid: '20260322-0150-test',
        agent: 'manager',
        input: 5000,
        output: 2000,
      });
      eventBus.safeEmit('tokens', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        input: 3000,
        output: 1500,
      });

      const usage = (observer as any).tokenUsage as Map<string, any>;
      expect(usage.size).toBe(2);

      const mgr = usage.get('manager');
      expect(mgr.inputTokens).toBe(5000);
      expect(mgr.outputTokens).toBe(2000);

      const impl = usage.get('implementer');
      expect(impl.inputTokens).toBe(3000);
      expect(impl.outputTokens).toBe(1500);
    });
  });

  // ── 6. handleAgentStart ───────────────────────────────────

  describe('handleAgentStart', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('marks agent as delegated', () => {
      eventBus.safeEmit('agent:start', {
        runid: '20260322-0150-test',
        agent: 'manager',
      });

      const delegations = (observer as any).agentDelegations as Map<string, boolean>;
      expect(delegations.get('manager')).toBe(true);
    });
  });

  // ── 7-8. handleAgentText ──────────────────────────────────

  describe('handleAgentText', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('stores text fragments for the agent', () => {
      eventBus.safeEmit('agent:text', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        text: 'First fragment',
      });
      eventBus.safeEmit('agent:text', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        text: 'Second fragment',
      });

      const texts = (observer as any).agentTexts as Map<string, string[]>;
      const implTexts = texts.get('implementer');
      expect(implTexts).toHaveLength(2);
      expect(implTexts![0]).toBe('First fragment');
      expect(implTexts![1]).toBe('Second fragment');
    });

    it('detects "good enough" satisficing language', () => {
      eventBus.safeEmit('agent:text', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        text: 'This is good enough, let us move on.',
      });

      const observations = (observer as any).observations as any[];
      const match = observations.find(
        (o: any) => o.type === 'anti-pattern' && o.actualBehavior.includes('good enough'),
      );
      expect(match).toBeDefined();
      expect(match.severity).toBe('WARNING');
    });

    it('detects "I\'ll skip this" satisficing language', () => {
      eventBus.safeEmit('agent:text', {
        runid: '20260322-0150-test',
        agent: 'reviewer',
        text: "I'll skip this since it looks fine.",
      });

      const observations = (observer as any).observations as any[];
      const match = observations.find(
        (o: any) => o.type === 'anti-pattern' && o.actualBehavior.includes("I'll skip this"),
      );
      expect(match).toBeDefined();
    });

    it('detects "to save time" satisficing language', () => {
      eventBus.safeEmit('agent:text', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        text: 'To save time, I will only check the main file.',
      });

      const observations = (observer as any).observations as any[];
      const match = observations.find(
        (o: any) => o.type === 'anti-pattern' && o.actualBehavior.includes('save time'),
      );
      expect(match).toBeDefined();
    });

    it('detects "probably works" satisficing language', () => {
      eventBus.safeEmit('agent:text', {
        runid: '20260322-0150-test',
        agent: 'tester',
        text: 'This probably works without testing further.',
      });

      const observations = (observer as any).observations as any[];
      const match = observations.find(
        (o: any) => o.type === 'anti-pattern' && o.actualBehavior.includes('probably works'),
      );
      expect(match).toBeDefined();
    });

    it('detects "should be fine" satisficing language', () => {
      eventBus.safeEmit('agent:text', {
        runid: '20260322-0150-test',
        agent: 'merger',
        text: 'The merge should be fine without reviewing again.',
      });

      const observations = (observer as any).observations as any[];
      const match = observations.find(
        (o: any) => o.type === 'anti-pattern' && o.actualBehavior.includes('should be fine'),
      );
      expect(match).toBeDefined();
    });
  });

  // ── 9-10. handleAudit and handleIteration ─────────────────

  describe('handleAudit', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('records tool calls per agent', () => {
      eventBus.safeEmit('audit', {
        tool: 'read_file',
        role: 'implementer',
      } as any);
      eventBus.safeEmit('audit', {
        tool: 'write_file',
        role: 'implementer',
      } as any);
      eventBus.safeEmit('audit', {
        tool: 'bash_exec',
        role: 'tester',
      } as any);

      const toolCalls = (observer as any).agentToolCalls as Map<string, string[]>;
      expect(toolCalls.get('implementer')).toEqual(['read_file', 'write_file']);
      expect(toolCalls.get('tester')).toEqual(['bash_exec']);
    });
  });

  describe('handleIteration', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('tracks iteration counts', () => {
      eventBus.safeEmit('iteration', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        current: 5,
        max: 50,
      });

      const iterations = (observer as any).agentIterations as Map<string, { current: number; max: number }>;
      const impl = iterations.get('implementer');
      expect(impl).toBeDefined();
      expect(impl!.current).toBe(5);
      expect(impl!.max).toBe(50);
    });
  });

  // ── activeAgentPrompts ─────────────────────────────────────

  describe('activeAgentPrompts', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('returns only prompts for agents that were delegated or had tool calls', () => {
      // Simulate: manager and implementer are active, others are not
      eventBus.safeEmit('agent:start', { runid: '20260322-0150-test', agent: 'manager' });
      eventBus.safeEmit('audit', { tool: 'read_file', role: 'implementer' } as any);

      const active = observer.activeAgentPrompts;
      expect(active.has('manager')).toBe(true);
      expect(active.has('implementer')).toBe(true);
      // These were never active during the run
      expect(active.has('consolidator')).toBe(false);
      expect(active.has('researcher')).toBe(false);
      expect(active.has('librarian')).toBe(false);
      // Total active should be much less than all prompts
      expect(active.size).toBeLessThan(observer.agentPrompts.size);
    });

    it('returns empty map when no agents were active', () => {
      const active = observer.activeAgentPrompts;
      expect(active.size).toBe(0);
    });
  });

  // ── 11-13. analyzeRun ─────────────────────────────────────

  describe('analyzeRun', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('detects absence when delegated agent has 0 read_file calls', () => {
      // Manager delegated but never used read_file
      eventBus.safeEmit('agent:start', {
        runid: '20260322-0150-test',
        agent: 'manager',
      });

      const observations = observer.analyzeRun();
      // Manager was delegated but made 0 tool calls → absence
      const absence = observations.find(
        (o) => o.type === 'absence' && o.agent === 'manager',
      );
      expect(absence).toBeDefined();
    });

    it('detects early stopping (low iteration usage)', () => {
      eventBus.safeEmit('agent:start', {
        runid: '20260322-0150-test',
        agent: 'implementer',
      });

      eventBus.safeEmit('iteration', {
        runid: '20260322-0150-test',
        agent: 'implementer',
        current: 1,
        max: 50,
      });

      const observations = observer.analyzeRun();
      const earlyStopping = observations.find(
        (o) => o.type === 'note' && o.agent === 'implementer',
      );
      expect(earlyStopping).toBeDefined();
      expect(earlyStopping?.actualBehavior).toContain('1/50');
    });

    it('returns empty array for a clean run (no delegations, no events)', () => {
      const observations = observer.analyzeRun();
      // No agents delegated, no events → no observations about absences/early stopping
      // There may be lint observations, but no runtime observations
      const runtimeObs = observations.filter(
        (o) => o.type === 'absence' || o.type === 'anti-pattern' || o.type === 'note',
      );
      expect(runtimeObs).toHaveLength(0);
    });
  });

  // ── 14-16. Token cost calculation ─────────────────────────

  describe('token cost calculation', () => {
    it('calculates cost correctly using known pricing', () => {
      // Using sonnet pricing: $3/M input, $15/M output
      const cost = calcCost(1_000_000, 1_000_000, 'sonnet');
      expect(cost).toBe(3.0 + 15.0);
      expect(cost).toBe(18.0);
    });

    it('uses default model when agent model is unknown', async () => {
      await observer.startObserving();

      // Emit tokens for an agent that has no explicit model mapping
      eventBus.safeEmit('tokens', {
        runid: '20260322-0150-test',
        agent: 'unknown-agent-xyz',
        input: 1_000_000,
        output: 1_000_000,
      });

      const usage = (observer as any).tokenUsage as Map<string, any>;
      const entry = usage.get('unknown-agent-xyz');
      expect(entry).toBeDefined();
      // Should use default model name
      expect(entry.model).toBe(DEFAULT_MODEL_CONFIG.model);
      // Cost should be calculated using the default model's pricing key
      const expectedKey = getModelShortName(DEFAULT_MODEL_CONFIG.model);
      const expectedCost = calcCost(1_000_000, 1_000_000, expectedKey);
      expect(entry.cost).toBeCloseTo(expectedCost, 4);
    });

    it('shows "ej tillgänglig" message when no token events', async () => {
      await observer.startObserving();
      const report = observer.generateReport([]);
      expect(report).toContain('Token-data ej tillgänglig');
    });
  });

  // ── 17-20. Prompt lint ────────────────────────────────────

  describe('prompt lint', () => {
    let lintTmpDir: string;
    let lintObserver: ObserverAgent;

    beforeEach(async () => {
      lintTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'observer-lint-'));

      // Create prompts directory with a test prompt
      const promptsDir = path.join(lintTmpDir, 'prompts');
      await fs.mkdir(promptsDir, { recursive: true });

      // Create preamble.md (should be filtered out)
      await fs.writeFile(path.join(promptsDir, 'preamble.md'), '# Preamble\nShared preamble.');

      // Create policy directory
      const policyDir = path.join(lintTmpDir, 'policy');
      await fs.mkdir(policyDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(lintTmpDir, { recursive: true, force: true });
    });

    it('detects numeric cap anti-pattern like "max 3 files"', async () => {
      // Write prompt with numeric cap
      await fs.writeFile(
        path.join(lintTmpDir, 'prompts', 'implementer.md'),
        '# Implementer\n\nYou should read max 3 files before making changes.',
      );

      // Write anti-patterns YAML
      await fs.writeFile(
        path.join(lintTmpDir, 'policy', 'prompt-antipatterns.yaml'),
        `patterns:
  - pattern: "\\\\bmax\\\\s+\\\\d+\\\\s+(fil|file|search|paper|grep|iteration)"
    flags: "gi"
    category: "numeric-cap"
    severity: "WARNING"
    legitimateContexts: ["api", "retry", "timeout", "rate.limit", "backoff"]
`,
      );

      const lintRunDir = path.join(lintTmpDir, 'runs', 'test-run');
      await fs.mkdir(lintRunDir, { recursive: true });
      const ctx = createMockContext(policy, lintRunDir);
      lintObserver = new ObserverAgent(ctx, lintTmpDir);
      await lintObserver.startObserving();

      const lintResults = (lintObserver as any).lintResults as any[];
      const numericCap = lintResults.find((r: any) => r.category === 'numeric-cap');
      expect(numericCap).toBeDefined();
      expect(numericCap.match).toContain('max 3 fil');
      expect(numericCap.severity).toBe('WARNING');
    });

    it('respects legitimate contexts (api retry downgrades to INFO)', async () => {
      // Write prompt with numeric cap in an API retry context
      await fs.writeFile(
        path.join(lintTmpDir, 'prompts', 'manager.md'),
        '# Manager\n\n## API Retry\n\nSet max 3 iterations for retry logic.',
      );

      // Write anti-patterns YAML
      await fs.writeFile(
        path.join(lintTmpDir, 'policy', 'prompt-antipatterns.yaml'),
        `patterns:
  - pattern: "\\\\bmax\\\\s+\\\\d+\\\\s+(fil|file|search|paper|grep|iteration)"
    flags: "gi"
    category: "numeric-cap"
    severity: "WARNING"
    legitimateContexts: ["api", "retry", "timeout", "rate.limit", "backoff"]
`,
      );

      const lintRunDir = path.join(lintTmpDir, 'runs', 'test-run');
      await fs.mkdir(lintRunDir, { recursive: true });
      const ctx = createMockContext(policy, lintRunDir);
      lintObserver = new ObserverAgent(ctx, lintTmpDir);
      await lintObserver.startObserving();

      const lintResults = (lintObserver as any).lintResults as any[];
      const hit = lintResults.find((r: any) => r.category === 'numeric-cap');
      expect(hit).toBeDefined();
      expect(hit.legitimate).toBe(true);
      expect(hit.severity).toBe('INFO'); // Downgraded from WARNING
    });

    it('handles empty anti-patterns list', async () => {
      await fs.writeFile(
        path.join(lintTmpDir, 'prompts', 'tester.md'),
        '# Tester\n\nRun all the tests.',
      );

      // Write YAML with empty patterns
      await fs.writeFile(
        path.join(lintTmpDir, 'policy', 'prompt-antipatterns.yaml'),
        'patterns: []\n',
      );

      const lintRunDir = path.join(lintTmpDir, 'runs', 'test-run');
      await fs.mkdir(lintRunDir, { recursive: true });
      const ctx = createMockContext(policy, lintRunDir);
      lintObserver = new ObserverAgent(ctx, lintTmpDir);
      await lintObserver.startObserving();

      const lintResults = (lintObserver as any).lintResults as any[];
      expect(lintResults).toHaveLength(0);
    });

    it('loads and parses YAML anti-patterns config correctly', async () => {
      await fs.writeFile(
        path.join(lintTmpDir, 'prompts', 'reviewer.md'),
        '# Reviewer\n\nReview the code.',
      );

      await fs.writeFile(
        path.join(lintTmpDir, 'policy', 'prompt-antipatterns.yaml'),
        `patterns:
  - pattern: "\\\\bfoo\\\\b"
    flags: "gi"
    category: "test-category"
    severity: "WARNING"
    legitimateContexts: ["bar"]
  - pattern: "\\\\bbaz\\\\b"
    flags: "gi"
    category: "another-category"
    severity: "INFO"
    legitimateContexts: []
`,
      );

      const lintRunDir = path.join(lintTmpDir, 'runs', 'test-run');
      await fs.mkdir(lintRunDir, { recursive: true });
      const ctx = createMockContext(policy, lintRunDir);
      lintObserver = new ObserverAgent(ctx, lintTmpDir);
      await lintObserver.startObserving();

      const antiPatterns = (lintObserver as any).antiPatterns as any[];
      expect(antiPatterns).toHaveLength(2);
      expect(antiPatterns[0].category).toBe('test-category');
      expect(antiPatterns[1].category).toBe('another-category');
    });
  });

  // ── 21-22. Tool alignment ────────────────────────────────

  describe('tool alignment', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('reports OK when expected tool was used', () => {
      eventBus.safeEmit('agent:start', {
        runid: '20260322-0150-test',
        agent: 'implementer',
      });
      eventBus.safeEmit('audit', {
        tool: 'write_file',
        role: 'implementer',
      } as any);

      const observations = observer.analyzeRun();
      const writeAbsence = observations.find(
        (o) =>
          o.type === 'absence' &&
          o.agent === 'implementer' &&
          o.actualBehavior.includes('write_file was never called'),
      );
      expect(writeAbsence).toBeUndefined();
    });

    it('reports TOOL_UNUSED when expected tool was not called', () => {
      // Tester is delegated but never calls bash_exec (expected for run test)
      eventBus.safeEmit('agent:start', {
        runid: '20260322-0150-test',
        agent: 'tester',
      });
      // Only use read_file, not bash_exec
      eventBus.safeEmit('audit', {
        tool: 'read_file',
        role: 'tester',
      } as any);

      const observations = observer.analyzeRun();
      const bashAbsence = observations.find(
        (o) =>
          o.type === 'absence' &&
          o.agent === 'tester' &&
          o.actualBehavior.includes('bash_exec was never called'),
      );
      expect(bashAbsence).toBeDefined();
      expect(bashAbsence!.severity).toBe('WARNING');
    });
  });

  // ── 23-24. Report generation ──────────────────────────────

  describe('generateReport', () => {
    it('contains all required sections', async () => {
      await observer.startObserving();

      eventBus.safeEmit('tokens', {
        runid: '20260322-0150-test',
        agent: 'manager',
        input: 5000,
        output: 2000,
      });

      const observations = observer.analyzeRun();
      const report = observer.generateReport(observations);

      expect(report).toContain('# Prompt Health');
      expect(report).toContain('## Teknik & Miljö');
      expect(report).toContain('### Agentmodeller');
      expect(report).toContain('## Token-förbrukning');
      expect(report).toContain('## Observationer');
      expect(report).toContain('## Prompt Lint');
      expect(report).toContain('## Tool-Alignment');
      expect(report).toContain('## Rekommendationer');
      expect(report).toContain('## Retro — Alla agenter');
    });

    it('contains retro section when no retro results provided', async () => {
      await observer.startObserving();
      const report = observer.generateReport([]);
      expect(report).toContain('_Inga retro-samtal genomförda._');
    });

    it('contains deep alignment placeholder when no alignment data provided', async () => {
      await observer.startObserving();
      const report = observer.generateReport([]);
      expect(report).toContain('## Djup Kod-Alignment');
      expect(report).toContain('_Inga djupa alignment-kontroller utförda._');
    });
  });

  // ── 25-26. Edge cases ─────────────────────────────────────

  describe('edge cases', () => {
    it('empty run (no events) generates a valid report', async () => {
      await observer.startObserving();
      const observations = observer.analyzeRun();
      const report = observer.generateReport(observations);

      // Should still have all sections
      expect(report).toContain('# Prompt Health');
      expect(report).toContain('## Teknik & Miljö');
      expect(report).toContain('## Token-förbrukning');
      expect(report).toContain('Token-data ej tillgänglig');
      expect(report).toContain('## Observationer');
      expect(report).toContain('## Prompt Lint');
      expect(report).toContain('## Tool-Alignment');
      expect(report).toContain('## Rekommendationer');
      expect(report).toContain('## Retro');
    });

    it('unknown model falls back to default pricing', () => {
      // Verify calcCost fallback behavior directly
      const unknownCost = calcCost(1_000_000, 1_000_000, 'totally-unknown-model');
      const sonnetCost = calcCost(1_000_000, 1_000_000, 'sonnet');
      expect(unknownCost).toBe(sonnetCost);
    });
  });

  // ── report generation (I/O handled by run.ts) ─────────────

  describe('generateReport output', () => {
    it('generates valid report content without writing to disk', async () => {
      await observer.startObserving();
      const report = observer.generateReport([]);
      expect(report).toContain('# Prompt Health');
    });
  });

  // ── checkZeroTokenAgents ──────────────────────────────────

  describe('checkZeroTokenAgents', () => {
    beforeEach(async () => {
      await observer.startObserving();
    });

    it('flags a delegated agent with 0 output tokens as WARNING absence', () => {
      // Emit agent:start to register delegation
      eventBus.safeEmit('agent:start', { runid: '20260322-0150-test', agent: 'historian' });
      // Emit tokens with 0 output
      eventBus.safeEmit('tokens', { agent: 'historian', input: 1000, output: 0 });

      const observations = observer.analyzeRun();
      const zeroTokenObs = observations.filter(
        (o) => o.type === 'absence' && o.severity === 'WARNING' && o.agent === 'historian' && o.actualBehavior?.includes('0 output tokens'),
      );
      expect(zeroTokenObs.length).toBe(1);
    });

    it('does NOT flag a non-delegated agent with 0 output tokens', () => {
      // Only emit tokens but NOT agent:start (not delegated)
      eventBus.safeEmit('tokens', { agent: 'never-delegated-agent', input: 500, output: 0 });

      const observations = observer.analyzeRun();
      const zeroTokenObs = observations.filter(
        (o) => o.agent === 'never-delegated-agent' && o.actualBehavior?.includes('0 output tokens'),
      );
      expect(zeroTokenObs.length).toBe(0);
    });
  });

});