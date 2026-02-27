import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { PolicyLimitsSchema, type PolicyLimits, type RunId } from './types.js';

export class PolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyViolationError';
  }
}

export class PolicyEnforcer {
  private allowlist: RegExp[] = [];
  private forbidden: RegExp[] = [];
  private limits: PolicyLimits;
  private workspaceRoot: string;
  private runsRoot: string;

  private readonly INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+previous\s+instructions/i,
    /ignore\s+all\s+instructions/i,
    /disregard\s+your/i,
    /you\s+are\s+now\s+/i,
    /act\s+as\s+if\s+you/i,
    /forget\s+everything/i,
    /new\s+persona/i,
    /\[SYSTEM\]/,
  ];

  constructor(
    private policyDir: string,
    private baseDir: string
  ) {
    this.workspaceRoot = path.join(baseDir, 'workspaces');
    this.runsRoot = path.join(baseDir, 'runs');
    // Limits loaded async in init()
    this.limits = {} as PolicyLimits;
  }

  async init(): Promise<void> {
    // Load bash allowlist
    const allowlistPath = path.join(this.policyDir, 'bash_allowlist.txt');
    const allowlistContent = await fs.readFile(allowlistPath, 'utf-8');
    this.allowlist = this.parsePatternFile(allowlistContent);

    // Load forbidden patterns
    const forbiddenPath = path.join(this.policyDir, 'forbidden_patterns.txt');
    const forbiddenContent = await fs.readFile(forbiddenPath, 'utf-8');
    this.forbidden = this.parsePatternFile(forbiddenContent);

    // Load limits
    const limitsPath = path.join(this.policyDir, 'limits.yaml');
    const limitsContent = await fs.readFile(limitsPath, 'utf-8');
    this.limits = PolicyLimitsSchema.parse(yaml.parse(limitsContent));
  }

  private parsePatternFile(content: string): RegExp[] {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((pattern) => new RegExp(pattern));
  }

  /**
   * Check if a bash command is allowed by policy.
   *
   * @param command - The shell command to validate
   * @returns Object with allowed status and reason if blocked
   */
  checkBashCommand(command: string): { allowed: boolean; reason?: string } {
    // Check forbidden patterns first (highest priority)
    for (const pattern of this.forbidden) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `BLOCKED: matches forbidden pattern: ${pattern.source}`,
        };
      }
    }

    // Check allowlist
    const isAllowed = this.allowlist.some((pattern) => pattern.test(command));
    if (!isAllowed) {
      return {
        allowed: false,
        reason: `BLOCKED: not in allowlist`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if a file path is within allowed write scope.
   *
   * @param filePath - Absolute file path to check
   * @param runid - Current run ID
   * @returns Object with allowed status and reason if blocked
   */
  checkFileWriteScope(
    filePath: string,
    runid: RunId
  ): { allowed: boolean; reason?: string } {
    const normalizedPath = path.resolve(filePath);

    // Allowed: workspace for this run
    const workspacePath = path.join(this.workspaceRoot, runid);
    if (normalizedPath.startsWith(workspacePath)) {
      return { allowed: true };
    }

    // Allowed: runs directory for this run
    const runPath = path.join(this.runsRoot, runid);
    if (normalizedPath.startsWith(runPath)) {
      return { allowed: true };
    }

    // Allowed: Neuron HQ repo itself (for self-development)
    // This is a bit meta but necessary
    if (normalizedPath.startsWith(this.baseDir)) {
      // But NOT in other run directories
      if (
        normalizedPath.startsWith(this.workspaceRoot) ||
        normalizedPath.startsWith(this.runsRoot)
      ) {
        return {
          allowed: false,
          reason: `BLOCKED: cannot write to other run's workspace/runs`,
        };
      }
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `BLOCKED: file write outside allowed scope`,
    };
  }

  /**
   * Check if diff size is within limits.
   *
   * @param additions - Number of lines added
   * @param deletions - Number of lines deleted
   * @returns Object with status and severity
   */
  checkDiffSize(
    additions: number,
    deletions: number
  ): { status: 'OK' | 'WARN' | 'BLOCK'; reason?: string } {
    const total = additions + deletions;

    if (total > this.limits.diff_block_lines) {
      return {
        status: 'BLOCK',
        reason: `Diff too large (${total} lines > ${this.limits.diff_block_lines} limit). Split into smaller changes.`,
      };
    }

    if (total > this.limits.diff_warn_lines) {
      return {
        status: 'WARN',
        reason: `Large diff (${total} lines). Consider splitting if possible.`,
      };
    }

    return { status: 'OK' };
  }

  /**
   * Get policy limits.
   */
  getLimits(): PolicyLimits {
    return this.limits;
  }

  /**
   * Validate run hours against limits.
   */
  validateRunHours(hours: number): { valid: boolean; reason?: string } {
    if (hours > this.limits.max_run_hours) {
      return {
        valid: false,
        reason: `Run hours (${hours}) exceeds limit (${this.limits.max_run_hours})`,
      };
    }
    return { valid: true };
  }

  /**
   * Validate brief content for prompt injection patterns.
   * Throws PolicyViolationError if injection patterns are detected.
   */
  validateBrief(content: string): void {
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        throw new PolicyViolationError(
          `Brief contains potential prompt injection: ${pattern.toString()}`
        );
      }
    }
  }
}

/**
 * Create and initialize a PolicyEnforcer instance.
 */
export async function createPolicyEnforcer(
  policyDir: string,
  baseDir: string
): Promise<PolicyEnforcer> {
  const enforcer = new PolicyEnforcer(policyDir, baseDir);
  await enforcer.init();
  return enforcer;
}
