import fs from 'fs/promises';
import path from 'path';
import { type RunId, type Target, type RunConfig, type StoplightStatus } from './types.js';
import { ArtifactsManager } from './artifacts.js';
import { AuditLogger } from './audit.js';
import { ManifestManager } from './manifest.js';
import { UsageTracker } from './usage.js';
import { Redactor } from './redaction.js';
import { Verifier } from './verify.js';
import { GitOperations } from './git.js';
import { PolicyEnforcer } from './policy.js';

export interface RunContext {
  runid: RunId;
  target: Target;
  hours: number;
  workspaceDir: string;
  runDir: string;
  artifacts: ArtifactsManager;
  audit: AuditLogger;
  manifest: ManifestManager;
  usage: UsageTracker;
  redactor: Redactor;
  verifier: Verifier;
  git: GitOperations;
  policy: PolicyEnforcer;
  startTime: Date;
  endTime: Date;
}

/** Directories to skip when copying a target repo to workspace. */
export const COPY_SKIP_DIRS: ReadonlySet<string> = new Set(['.git', 'node_modules', '.venv', 'workspaces', 'runs']);

/**
 * Count completed runs by reading memory/runs.md.
 * Returns 0 if the file doesn't exist or is empty.
 */
export async function countMemoryRuns(memoryDir: string): Promise<number> {
  const runsFile = path.join(memoryDir, 'runs.md');
  try {
    const content = await fs.readFile(runsFile, 'utf-8');
    const matches = content.match(/^## Körning /gm);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

export class RunOrchestrator {
  constructor(
    private baseDir: string,
    private policy: PolicyEnforcer
  ) {}

  /**
   * Generate a run ID.
   */
  generateRunId(slug: string = 'run'): RunId {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 16).replace(':', '');
    return `${dateStr}-${timeStr}-${slug}` as RunId;
  }

  /**
   * Build shared context components used by both initRun and resumeRun.
   */
  private async _buildContext(params: {
    runDir: string;
    workspaceDir: string;
    runid: RunId;
  }): Promise<{
    artifacts: ArtifactsManager;
    audit: AuditLogger;
    manifest: ManifestManager;
    usage: UsageTracker;
    redactor: Redactor;
    verifier: Verifier;
  }> {
    const { runDir, workspaceDir, runid } = params;
    const artifacts = new ArtifactsManager(runDir);
    await artifacts.init();
    const audit = new AuditLogger(path.join(runDir, 'audit.jsonl'));
    const manifest = new ManifestManager(path.join(runDir, 'manifest.json'));
    const usage = new UsageTracker(runid);
    const redactor = new Redactor();
    const verifier = new Verifier(workspaceDir, this.policy.getLimits().verification_timeout_seconds);
    return { artifacts, audit, manifest, usage, redactor, verifier };
  }

  /**
   * Initialize a new run.
   */
  async initRun(config: RunConfig): Promise<RunContext> {
    const { runid, target, hours } = config;

    // Create directories
    const workspaceDir = path.join(this.baseDir, 'workspaces', runid, target.name);
    const runDir = path.join(this.baseDir, 'runs', runid);

    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(runDir, { recursive: true });

    // Initialize components
    const { artifacts, audit, manifest, usage, redactor, verifier } =
      await this._buildContext({ runDir, workspaceDir, runid });

    // Clone or copy target repo to workspace
    await this.prepareWorkspace(target, workspaceDir);

    const git = new GitOperations(workspaceDir);
    const startSHA = await git.getCurrentSHA();

    // Create workspace branch
    const workspaceBranch = `neuron/${runid}`;
    await git.createBranch(workspaceBranch);

    // Initialize manifest
    await manifest.create({
      runid,
      target_name: target.name,
      target_start_sha: startSHA,
      workspace_branch: workspaceBranch,
      started_at: new Date().toISOString(),
      commands: [],
      checksums: {},
    });

    // Copy brief to run directory
    const briefContent = await fs.readFile(config.brief_path, 'utf-8');
    await artifacts.writeBrief(briefContent);

    const endTime = new Date();
    endTime.setHours(endTime.getHours() + hours);

    return {
      runid,
      target,
      hours,
      workspaceDir,
      runDir,
      artifacts,
      audit,
      manifest,
      usage,
      redactor,
      verifier,
      git,
      policy: this.policy,
      startTime: new Date(),
      endTime,
    };
  }

  /**
   * Prepare workspace by cloning or copying target repo.
   */
  private async prepareWorkspace(target: Target, workspaceDir: string): Promise<void> {
    // Check if target.path is a URL or local path
    if (target.path.startsWith('http://') || target.path.startsWith('https://')) {
      // Clone from URL — preserves git history and creates isolated repo
      await GitOperations.clone(target.path, workspaceDir);
    } else {
      // Copy from local path, then initialize a fresh git repo so workspace
      // is isolated from any parent git repo (e.g. neuron-hq itself)
      await this.copyDirectory(target.path, workspaceDir);
      await GitOperations.initWorkspace(workspaceDir, target.name);
    }
  }

  /**
   * Recursively copy a directory.
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (COPY_SKIP_DIRS.has(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Finalize a run (write final artifacts).
   */
  async finalizeRun(
    ctx: RunContext,
    stoplight: StoplightStatus,
    reportContent: string
  ): Promise<void> {
    // Write report
    await ctx.artifacts.writeReport(stoplight, reportContent);

    // Save usage
    await ctx.usage.save(path.join(ctx.runDir, 'usage.json'));

    // Write redaction report
    const redactionReport = ctx.redactor.generateReport();
    await ctx.artifacts.writeRedactionReport(redactionReport);

    // Complete manifest
    await ctx.manifest.complete();

    // Compute checksums for all artifacts
    const artifactPaths = ctx.artifacts.getArtifactPaths();
    const checksums: Record<string, string> = {};

    for (const [, filePath] of Object.entries(artifactPaths)) {
      try {
        const checksum = await ManifestManager.checksumFile(filePath);
        checksums[path.basename(filePath)] = checksum;
      } catch {
        // File might not exist (e.g., sources.md if no research)
      }
    }

    await ctx.manifest.addChecksums(checksums);
  }

  /**
   * Resume a previous run using its existing workspace.
   * Creates a new run directory but reuses the old workspace (preserving changes).
   */
  async resumeRun(
    oldRunId: RunId,
    newRunId: RunId,
    target: Target,
    hours: number
  ): Promise<RunContext> {
    // Point to the existing workspace from the old run
    const workspaceDir = path.join(this.baseDir, 'workspaces', oldRunId, target.name);
    const runDir = path.join(this.baseDir, 'runs', newRunId);

    // Verify old workspace exists
    try {
      await fs.access(workspaceDir);
    } catch {
      throw new Error(
        `Workspace for run '${oldRunId}' not found at: ${workspaceDir}\n` +
        `The workspace may have been deleted after the original run completed.`
      );
    }

    await fs.mkdir(runDir, { recursive: true });

    // Initialize components
    const { artifacts, audit, manifest, usage, redactor, verifier } =
      await this._buildContext({ runDir, workspaceDir, runid: newRunId });

    const git = new GitOperations(workspaceDir);
    const currentSHA = await git.getCurrentSHA();

    // Continue on the same branch the old run was using
    const workspaceBranch = `neuron/${oldRunId}`;

    await manifest.create({
      runid: newRunId,
      target_name: target.name,
      target_start_sha: currentSHA,
      workspace_branch: workspaceBranch,
      started_at: new Date().toISOString(),
      commands: [],
      checksums: {},
    });

    // Copy brief from old run (fall back to placeholder if missing)
    const oldBriefPath = path.join(this.baseDir, 'runs', oldRunId, 'brief.md');
    try {
      const briefContent = await fs.readFile(oldBriefPath, 'utf-8');
      await artifacts.writeBrief(briefContent);
    } catch {
      await artifacts.writeBrief(`# Resumed Run\n\nResumed from: ${oldRunId}\n\nNo brief found in previous run.`);
    }

    const endTime = new Date();
    endTime.setHours(endTime.getHours() + hours);

    return {
      runid: newRunId,
      target,
      hours,
      workspaceDir,
      runDir,
      artifacts,
      audit,
      manifest,
      usage,
      redactor,
      verifier,
      git,
      policy: this.policy,
      startTime: new Date(),
      endTime,
    };
  }

  /**
   * Get the number of milliseconds remaining until the run time limit.
   * Returns 0 if the time limit has already passed.
   */
  getTimeRemainingMs(ctx: RunContext): number {
    return Math.max(0, ctx.endTime.getTime() - Date.now());
  }

  /**
   * Check if run time limit exceeded.
   */
  isTimeExpired(ctx: RunContext): boolean {
    return this.getTimeRemainingMs(ctx) === 0;
  }
}
