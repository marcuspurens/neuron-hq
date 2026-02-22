import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { RunOrchestrator } from '../../src/core/run.js';
import { createPolicyEnforcer } from '../../src/core/policy.js';
import { fileURLToPath } from 'url';
import type { RunId, Target } from '../../src/core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '../..');

// GitOperations reads from real git — mock it for unit tests
vi.mock('../../src/core/git.js', () => ({
  GitOperations: vi.fn().mockImplementation(() => ({
    getCurrentSHA: vi.fn().mockResolvedValue('abc123deadbeef'),
    createBranch: vi.fn().mockResolvedValue(undefined),
    getCurrentBranch: vi.fn().mockResolvedValue('swarm/20260101-1200-test'),
  })),
}));

const MOCK_TARGET: Target = {
  name: 'test-target',
  path: '/tmp/test-src',
  default_branch: 'main',
  verify_commands: [],
};

async function createFakeOldRun(
  baseDir: string,
  oldRunId: RunId
): Promise<{ oldRunDir: string; oldWorkspaceDir: string }> {
  const oldRunDir = path.join(baseDir, 'runs', oldRunId);
  const oldWorkspaceDir = path.join(baseDir, 'workspaces', oldRunId, MOCK_TARGET.name);

  await fs.mkdir(oldRunDir, { recursive: true });
  await fs.mkdir(oldWorkspaceDir, { recursive: true });

  // Write a minimal manifest for the old run
  const manifest = {
    runid: oldRunId,
    target_name: MOCK_TARGET.name,
    target_start_sha: 'abc123',
    workspace_branch: `swarm/${oldRunId}`,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    commands: [],
    checksums: {},
  };
  await fs.writeFile(path.join(oldRunDir, 'manifest.json'), JSON.stringify(manifest));

  // Write a brief in the old run dir
  await fs.writeFile(path.join(oldRunDir, 'brief.md'), '# Test Brief\n\nDo the thing.');

  // Create a dummy .git so GitOperations doesn't fail
  await fs.mkdir(path.join(oldWorkspaceDir, '.git'), { recursive: true });

  return { oldRunDir, oldWorkspaceDir };
}

describe('RunOrchestrator.resumeRun', () => {
  let tempBase: string;
  let policy: Awaited<ReturnType<typeof createPolicyEnforcer>>;
  let orchestrator: RunOrchestrator;

  beforeEach(async () => {
    tempBase = await fs.mkdtemp(path.join(os.tmpdir(), 'resume-test-'));
    policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
    orchestrator = new RunOrchestrator(tempBase, policy);
  });

  afterEach(async () => {
    await fs.rm(tempBase, { recursive: true, force: true });
  });

  it('throws if old workspace does not exist', async () => {
    const oldRunId = '20260101-1200-old' as RunId;
    const newRunId = '20260101-1300-new' as RunId;

    await expect(
      orchestrator.resumeRun(oldRunId, newRunId, MOCK_TARGET, 1)
    ).rejects.toThrow(/Workspace for run '20260101-1200-old' not found/);
  });

  it('creates new run directory and reuses old workspace', async () => {
    const oldRunId = '20260101-1200-old' as RunId;
    const newRunId = '20260101-1300-new' as RunId;

    const { oldWorkspaceDir } = await createFakeOldRun(tempBase, oldRunId);

    const ctx = await orchestrator.resumeRun(oldRunId, newRunId, MOCK_TARGET, 1);

    // New run dir should be created
    const newRunDir = path.join(tempBase, 'runs', newRunId);
    await expect(fs.access(newRunDir)).resolves.toBeUndefined();

    // Workspace should point to the OLD run's workspace
    expect(ctx.workspaceDir).toBe(oldWorkspaceDir);
    expect(ctx.runid).toBe(newRunId);
    expect(ctx.target).toEqual(MOCK_TARGET);
  });

  it('copies brief from old run to new run', async () => {
    const oldRunId = '20260101-1200-old' as RunId;
    const newRunId = '20260101-1300-new' as RunId;

    await createFakeOldRun(tempBase, oldRunId);

    await orchestrator.resumeRun(oldRunId, newRunId, MOCK_TARGET, 1);

    const newBriefPath = path.join(tempBase, 'runs', newRunId, 'brief.md');
    const briefContent = await fs.readFile(newBriefPath, 'utf-8');
    expect(briefContent).toContain('# Test Brief');
  });

  it('writes placeholder brief if old brief is missing', async () => {
    const oldRunId = '20260101-1200-old' as RunId;
    const newRunId = '20260101-1300-new' as RunId;

    // Create workspace but no brief.md in old run dir
    await createFakeOldRun(tempBase, oldRunId);
    await fs.rm(path.join(tempBase, 'runs', oldRunId, 'brief.md'));

    await orchestrator.resumeRun(oldRunId, newRunId, MOCK_TARGET, 1);

    const newBriefPath = path.join(tempBase, 'runs', newRunId, 'brief.md');
    const briefContent = await fs.readFile(newBriefPath, 'utf-8');
    expect(briefContent).toContain(oldRunId);
  });

  it('sets correct endTime based on hours', async () => {
    const oldRunId = '20260101-1200-old' as RunId;
    const newRunId = '20260101-1300-new' as RunId;
    const hours = 2;

    await createFakeOldRun(tempBase, oldRunId);

    const before = Date.now();
    const ctx = await orchestrator.resumeRun(oldRunId, newRunId, MOCK_TARGET, hours);
    const after = Date.now();

    const expectedEnd = before + hours * 3_600_000;
    expect(ctx.endTime.getTime()).toBeGreaterThanOrEqual(expectedEnd - 100);
    expect(ctx.endTime.getTime()).toBeLessThanOrEqual(after + hours * 3_600_000 + 100);
  });

  it('sets workspace_branch to old run branch in manifest', async () => {
    const oldRunId = '20260101-1200-old' as RunId;
    const newRunId = '20260101-1300-new' as RunId;

    await createFakeOldRun(tempBase, oldRunId);
    const ctx = await orchestrator.resumeRun(oldRunId, newRunId, MOCK_TARGET, 1);

    const manifestContent = await fs.readFile(
      path.join(ctx.runDir, 'manifest.json'),
      'utf-8'
    );
    const manifest = JSON.parse(manifestContent);
    expect(manifest.workspace_branch).toBe(`neuron/${oldRunId}`);
  });
});

describe('RunOrchestrator.generateRunId (resume slug)', () => {
  it('includes target name in generated resume run ID', async () => {
    const policy = await createPolicyEnforcer(path.join(BASE_DIR, 'policy'), BASE_DIR);
    const orchestrator = new RunOrchestrator('/tmp', policy);
    const runId = orchestrator.generateRunId('my-repo-resume');
    expect(runId).toMatch(/^\d{8}-\d{4}-my-repo-resume$/);
  });
});
