import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { AuditLogger } from './audit.js';
import { eventBus } from './event-bus.js';

const execFileAsync = promisify(execFile);

export interface EmergencySaveOptions {
  agentName: string;
  iteration: number;
  maxIterations: number;
  workspaceDir: string;
  runDir: string;
  runid: string;
  audit: AuditLogger;
}

export interface EmergencySaveResult {
  saved: boolean;
  commitHash?: string;
  message?: string;
}

/**
 * Emergency save: commit all uncommitted changes when an agent reaches max iterations.
 * Creates WARNING.md in runDir, recovery.md and .preserved in workspaceDir.
 */
export async function emergencySave(options: EmergencySaveOptions): Promise<EmergencySaveResult> {
  const { agentName, iteration, maxIterations, workspaceDir, runDir, runid, audit } = options;

  // Check if there are uncommitted changes
  let status: string;
  try {
    const result = await execFileAsync('git', ['status', '--porcelain'], { cwd: workspaceDir });
    status = result.stdout.trim();
  } catch {  /* intentional: best-effort emergency save */
    return { saved: false, message: 'Failed to check git status' };
  }

  if (!status) {
    return { saved: false, message: 'No uncommitted changes' };
  }

  // Stage and commit everything
  const commitMessage = `EMERGENCY SAVE: ${agentName} reached max iterations (${iteration}/${maxIterations})`;
  let commitHash: string | undefined;
  try {
    await execFileAsync('git', ['add', '-A'], { cwd: workspaceDir });
    await execFileAsync('git', ['commit', '-m', commitMessage], { cwd: workspaceDir });
    const hashResult = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspaceDir });
    commitHash = hashResult.stdout.trim();
  } catch {  /* intentional: best-effort emergency save */
    return { saved: false, message: 'Failed to commit changes' };
  }

  // Get the branch name
  let branchName = 'unknown';
  try {
    const branchResult = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspaceDir });
    branchName = branchResult.stdout.trim();
  } catch {  /* intentional: best-effort emergency save */
    // non-fatal
  }

  // Write WARNING.md to runDir
  const warningContent = `# ⚠️ VARNING: Max iterationer nådda

**Agent:** ${agentName}
**Iterationer:** ${iteration}/${maxIterations}
**Tidpunkt:** ${new Date().toISOString()}
**Commit:** ${commitHash || 'unknown'}
**Branch:** ${branchName}

## Vad hände?

${agentName} nådde max iterationer (${maxIterations}) innan merge till main genomfördes.
Arbetet har sparats i en nödkommit men har **inte** mergats till main.

## Återställning

Se \`recovery.md\` i workspace-katalogen eller kör:

\`\`\`bash
cd ${workspaceDir}
git log --oneline -5
git diff main
\`\`\`
`;
  try {
    await fs.writeFile(path.join(runDir, 'WARNING.md'), warningContent, 'utf-8');
  } catch {  /* intentional: best-effort emergency save */
    // non-fatal
  }

  // Write recovery.md to workspaceDir
  const recoveryContent = `# Återställning

Koden finns i workspace-branchen. Kör:

\`\`\`bash
cd ${workspaceDir}
git log --oneline -5   # Se committad kod
git diff main           # Se skillnaden mot main

# Applicera manuellt:
git checkout main
git cherry-pick ${commitHash || '<commit-hash>'}
\`\`\`
`;
  try {
    await fs.writeFile(path.join(workspaceDir, 'recovery.md'), recoveryContent, 'utf-8');
  } catch {  /* intentional: best-effort emergency save */
    // non-fatal
  }

  // Write .preserved marker file
  try {
    await fs.writeFile(
      path.join(workspaceDir, '.preserved'),
      JSON.stringify({
        reason: 'emergency_save',
        agent: agentName,
        iteration,
        maxIterations,
        commitHash,
        branchName,
        timestamp: new Date().toISOString(),
      }, null, 2),
      'utf-8'
    );
  } catch {  /* intentional: best-effort emergency save */
    // non-fatal
  }

  // Log to audit
  await audit.log({
    ts: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    role: agentName as any,
    tool: 'emergency_save',
    allowed: true,
    note: `EMERGENCY SAVE: ${agentName} committed workspace at iteration ${iteration}/${maxIterations}. Hash: ${commitHash}`,
  });

  // Emit warning event
  eventBus.safeEmit('warning', {
    runid,
    type: 'max_iterations',
    message: `${agentName} nådde max iterationer (${iteration}/${maxIterations}). Koden sparades i workspace men mergades inte till main.`,
    agent: agentName,
    recoveryPath: workspaceDir,
  });

  // Console warning
  console.warn(`⚠️ EMERGENCY SAVE: ${agentName} committed workspace at iteration ${iteration}/${maxIterations}`);

  return { saved: true, commitHash, message: commitMessage };
}
