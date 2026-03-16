/**
 * Builds a picture of what an agent saw and didn't see during a run.
 * Pure module — no file I/O, no EventBus. All functions are deterministic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Audit log entry (same shape as used by decision-extractor). */
export interface AuditEntry {
  ts?: string;
  role?: string;
  agent?: string;
  tool?: string;
  allowed?: boolean;
  note?: string;
  target?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

/** What the agent can and cannot see. */
export interface FieldOfView {
  agent: string;
  timestamp: string;

  sees: {
    briefContent: string;
    taskDescription: string;
    filesRead: string[];
    filesModified: string[];
    testResults?: string;
    adaptiveHints?: string[];
    previousAttempts?: string;
  };

  doesNotSee: {
    otherAgentWork: string[];
    fullGitHistory: boolean;
    unreadFiles: string[];
    otherRunHistory: boolean;
    policyConstraints: string[];
  };
}

/** Options for captureFieldOfView. */
export interface CaptureOptions {
  briefContent?: string;
  taskDescription?: string;
  workspaceFiles?: string[];
  parallelAgents?: { agent: string; taskId: string }[];
  policyConstraints?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether an audit entry belongs to the given agent.
 * Matches case-insensitively on both `role` and `agent` fields.
 */
function isAgentEntry(entry: AuditEntry, agent: string): boolean {
  const lower = agent.toLowerCase();
  const role = (entry.role ?? '').toLowerCase();
  const entryAgent = (entry.agent ?? '').toLowerCase();
  return role === lower || entryAgent === lower;
}

/**
 * Extract a file path from an audit entry's args.
 * Looks at args.path (string) for read_file / write_file.
 */
function extractPathFromArgs(entry: AuditEntry): string | undefined {
  const args = entry.args;
  if (!args) return undefined;
  if (typeof args.path === 'string' && args.path.length > 0) {
    return args.path;
  }
  return undefined;
}

/** Bash write-pattern regexes (redirects like > file, >> file, tee file). */
const BASH_WRITE_PATTERNS = [
  />\s*(\S+)/,          // > file  or >> file (first capture is the path)
  /tee\s+(?:-a\s+)?(\S+)/,  // tee file  or tee -a file
];

/**
 * Extract written file paths from a bash command string.
 */
function extractWrittenFilesFromBash(command: string): string[] {
  const files: string[] = [];
  for (const pattern of BASH_WRITE_PATTERNS) {
    const match = command.match(pattern);
    if (match?.[1]) {
      files.push(match[1]);
    }
  }
  return files;
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Deduplicate an array of strings preserving order.
 */
function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Capture the field of view for a given agent based on audit entries.
 *
 * @param agent - The agent name (e.g. 'manager', 'implementer')
 * @param auditEntries - All audit entries from the run
 * @param options - Additional context (brief, parallel agents, etc.)
 * @returns A FieldOfView describing what the agent saw and didn't see
 */
export function captureFieldOfView(
  agent: string,
  auditEntries: AuditEntry[],
  options?: CaptureOptions,
): FieldOfView {
  const agentEntries = auditEntries.filter((e) => isAgentEntry(e, agent));

  // --- sees.filesRead ---
  const filesRead: string[] = [];
  for (const entry of agentEntries) {
    if (entry.tool === 'read_file') {
      const path = extractPathFromArgs(entry);
      if (path) filesRead.push(path);
    }
  }

  // --- sees.filesModified ---
  const filesModified: string[] = [];
  for (const entry of agentEntries) {
    if (entry.tool === 'write_file') {
      const path = extractPathFromArgs(entry);
      if (path) filesModified.push(path);
    } else if (entry.tool === 'bash_exec' || entry.tool === 'bash') {
      const cmd = entry.args?.command;
      if (typeof cmd === 'string') {
        filesModified.push(...extractWrittenFilesFromBash(cmd));
      }
    }
  }

  const uniqueRead = unique(filesRead);
  const uniqueModified = unique(filesModified);

  // --- doesNotSee.unreadFiles ---
  const touchedSet = new Set([...uniqueRead, ...uniqueModified]);
  const unreadFiles = (options?.workspaceFiles ?? []).filter((f) => !touchedSet.has(f));

  // --- doesNotSee.otherAgentWork ---
  const otherAgentWork = (options?.parallelAgents ?? []).map(
    (pa) => `${capitalize(pa.agent)} arbetar parallellt med ${pa.taskId}`,
  );

  // --- doesNotSee.policyConstraints ---
  const blockedTools = agentEntries
    .filter((e) => e.allowed === false && e.tool)
    .map((e) => e.tool as string);
  const policyConstraints = unique([
    ...(options?.policyConstraints ?? []),
    ...blockedTools,
  ]);

  return {
    agent,
    timestamp: new Date().toISOString(),
    sees: {
      briefContent: options?.briefContent ?? '',
      taskDescription: options?.taskDescription ?? '',
      filesRead: uniqueRead,
      filesModified: uniqueModified,
    },
    doesNotSee: {
      otherAgentWork,
      fullGitHistory: true,
      otherRunHistory: true,
      unreadFiles,
      policyConstraints,
    },
  };
}

/**
 * Produce a Swedish-language summary of a FieldOfView.
 *
 * Example output:
 * "Manager läste 3 filer (brief.md, types.ts, event-bus.ts). Såg inte: 2 olösta filer, parallellt arbete av Implementer."
 */
export function summarizeFieldOfView(fov: FieldOfView): string {
  const agentName = capitalize(fov.agent);
  const parts: string[] = [];

  // Files read
  const readCount = fov.sees.filesRead.length;
  if (readCount > 0) {
    const names = fov.sees.filesRead.map((f) => f.split('/').pop() ?? f).join(', ');
    parts.push(`${agentName} läste ${readCount} ${readCount === 1 ? 'fil' : 'filer'} (${names})`);
  } else {
    parts.push(`${agentName} läste inga filer`);
  }

  // Build "Såg inte" section
  const blindSpots: string[] = [];

  const unreadCount = fov.doesNotSee.unreadFiles.length;
  if (unreadCount > 0) {
    blindSpots.push(`${unreadCount} ${unreadCount === 1 ? 'oläst fil' : 'olästa filer'}`);
  }

  if (fov.doesNotSee.otherAgentWork.length > 0) {
    const agents = fov.doesNotSee.otherAgentWork
      .map((s) => s.split(' ')[0])
      .join(', ');
    blindSpots.push(`parallellt arbete av ${agents}`);
  }

  if (fov.doesNotSee.policyConstraints.length > 0) {
    blindSpots.push(
      `${fov.doesNotSee.policyConstraints.length} policy-begränsning${fov.doesNotSee.policyConstraints.length === 1 ? '' : 'ar'}`,
    );
  }

  if (blindSpots.length > 0) {
    parts.push(`Såg inte: ${blindSpots.join(', ')}`);
  }

  return parts.join('. ') + '.';
}
