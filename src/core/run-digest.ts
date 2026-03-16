import fs from 'fs/promises';
import path from 'path';
import { calcCost } from './pricing.js';
import { extractDecisions, getDigestDecisions } from './decision-extractor.js';
import type { Decision, AuditEntry as DecisionAuditEntry, EventData } from './decision-extractor.js';
import { captureFieldOfView, summarizeFieldOfView } from './field-of-view.js';
import type { AuditEntry as FovAuditEntry } from './field-of-view.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DigestData {
  runid: string;
  briefTitle: string;
  timing: { start: string; end: string; durationMin: number };
  stoplight: 'GREEN' | 'YELLOW' | 'RED' | 'unknown';
  costUsd: number;
  testsAdded: number;
  plan: TaskInfo[];
  completed: TaskResult[];
  events: DigestEvent[];
  results: CodeMetrics;
  learnings: string[];
}

export interface TaskInfo {
  id: string;
  description: string;
}

export interface TaskResult {
  id: string;
  status: 'completed' | 'failed' | 'skipped';
  summary: string;
}

export interface DigestEvent {
  timestamp: string;
  text: string;
}

export interface CodeMetrics {
  filesModified: number;
  filesNew: number;
  insertions: number;
  deletions: number;
}

// ---------------------------------------------------------------------------
// File reading helpers (swallow missing-file errors)
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function readTextSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function readJsonlSafe<T>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Extract first H1 from brief markdown, or first line, or default.
 */
export function parseBriefTitle(briefContent: string): string {
  if (!briefContent.trim()) return 'Okänd brief';

  // Try to match # heading
  const h1Match = briefContent.match(/^#\s+(.+)$/m);
  if (h1Match) {
    // Strip "Brief:" prefix if present
    return h1Match[1].replace(/^Brief:\s*/i, '').trim();
  }

  // Fall back to first non-empty line
  const firstLine = briefContent.trim().split('\n')[0].trim();
  return firstLine || 'Okänd brief';
}

/**
 * Parse task_plan.md to extract task IDs and descriptions.
 * Expects lines like: "- **T1**: Description" or "- T1: Description"
 * or "## T1 — Description" or numbered "1. T1: Description"
 */
export function parseTaskPlan(taskPlanContent: string): TaskInfo[] {
  const tasks: TaskInfo[] = [];
  if (!taskPlanContent.trim()) return tasks;

  const lines = taskPlanContent.split('\n');
  for (const line of lines) {
    // Match patterns like "- **T1**: desc", "- T1: desc", "- T1 — desc"
    const match = line.match(
      /[-*]\s+\*{0,2}(T\d+)\*{0,2}\s*[:—–-]\s*(.+)/,
    );
    if (match) {
      tasks.push({ id: match[1], description: match[2].trim() });
      continue;
    }

    // Match "## T1 — desc" or "## T1: desc"
    const headingMatch = line.match(
      /^#{1,3}\s+(T\d+)\s*[:—–-]\s*(.+)/,
    );
    if (headingMatch) {
      tasks.push({
        id: headingMatch[1],
        description: headingMatch[2].trim(),
      });
    }
  }

  return tasks;
}

/**
 * Format seconds to 'X min' or 'X tim Y min'.
 */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours} tim`;
  }
  return `${hours} tim ${minutes} min`;
}

/**
 * Filter audit.jsonl lines to interesting events.
 * Returns max 20 highlights in chronological order.
 */
export function extractHighlights(auditLines: string[]): DigestEvent[] {
  const events: DigestEvent[] = [];

  for (const line of auditLines) {
    let entry: AuditLine;
    try {
      entry = JSON.parse(line) as AuditLine;
    } catch {
      continue;
    }

    const isInteresting =
      entry.tool?.startsWith('delegate_to_') ||
      entry.allowed === false ||
      /test/i.test(entry.tool ?? '') ||
      /test/i.test(entry.note ?? '') ||
      entry.tool === 'delegate_to_merger';

    if (isInteresting) {
      const text = buildEventText(entry);
      events.push({ timestamp: entry.ts ?? '', text });
    }
  }

  // Sort chronologically then limit to 20
  events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return events.slice(0, 20);
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AuditLine {
  ts?: string;
  role?: string;
  tool?: string;
  allowed?: boolean;
  note?: string;
  policy_event?: string;
}

interface MetricsJson {
  runid?: string;
  timing?: {
    started_at?: string;
    completed_at?: string;
    duration_seconds?: number;
  };
  testing?: {
    baseline_passed?: number;
    after_passed?: number;
    tests_added?: number;
  };
  tokens?: {
    total_input?: number;
    total_output?: number;
  };
  code?: {
    files_modified?: number;
    files_new?: number;
    insertions?: number;
    deletions?: number;
  };
}

interface UsageJson {
  runid?: string;
  total_input_tokens?: number;
  total_output_tokens?: number;
}

interface TaskScoreLine {
  task_id?: string;
  aggregate?: number;
  status?: string;
  summary?: string;
}

// ---------------------------------------------------------------------------
// Build helpers
// ---------------------------------------------------------------------------

function buildEventText(entry: AuditLine): string {
  if (entry.allowed === false) {
    return `🚫 Blockerad: ${entry.tool ?? 'unknown'}${entry.policy_event ? ` — ${entry.policy_event}` : ''}`;
  }
  if (entry.tool === 'delegate_to_merger') {
    return `🔀 Merge-delegering (${entry.role ?? 'unknown'})`;
  }
  if (entry.tool?.startsWith('delegate_to_')) {
    const target = entry.tool.slice('delegate_to_'.length);
    return `📋 Delegering → ${target} (${entry.role ?? 'unknown'})`;
  }
  if (/test/i.test(entry.tool ?? '') || /test/i.test(entry.note ?? '')) {
    return `🧪 ${entry.note ?? entry.tool ?? 'test event'}`;
  }
  return entry.note ?? entry.tool ?? 'event';
}

function stoplightEmoji(status: string): string {
  switch (status) {
    case 'GREEN':
      return '🟢';
    case 'YELLOW':
      return '🟡';
    case 'RED':
      return '🔴';
    default:
      return '⚪';
  }
}

function extractStoplight(reportText: string): 'GREEN' | 'YELLOW' | 'RED' | 'unknown' {
  const match = reportText.match(/STOPLIGHT[:\s]+(GREEN|YELLOW|RED)/i);
  if (match) return match[1].toUpperCase() as 'GREEN' | 'YELLOW' | 'RED';
  return 'unknown';
}

function extractLearnings(knowledgeText: string): string[] {
  if (!knowledgeText.trim()) return [];

  const lines = knowledgeText.split('\n');
  const learnings: string[] = [];

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (bulletMatch && bulletMatch[1].trim().length > 0) {
      learnings.push(bulletMatch[1].trim());
      if (learnings.length >= 5) break;
    }
  }

  return learnings;
}

function parseTaskScores(scores: TaskScoreLine[]): TaskResult[] {
  return scores.map((s) => ({
    id: s.task_id ?? 'unknown',
    status:
      (s.aggregate ?? 0) >= 0.5
        ? ('completed' as const)
        : ('failed' as const),
    summary: s.summary ?? `Score: ${s.aggregate ?? 0}`,
  }));
}


/**
 * Build an ASCII confidence histogram from all decisions.
 * Returns empty string if fewer than 3 decisions.
 */
export function buildConfidenceHistogram(decisions: Decision[]): string {
  const total = decisions.length;
  if (total < 3) return '';

  let high = 0;
  let medium = 0;
  let low = 0;
  for (const d of decisions) {
    if (d.confidence === 'high') high++;
    else if (d.confidence === 'medium') medium++;
    else low++;
  }

  const bar = (count: number): string => '\u2588'.repeat(Math.round(count / total * 10));
  const pct = (count: number): number => Math.round(count / total * 100);

  const lines: string[] = [];
  lines.push('## Beslutsf\u00F6rdelning');
  lines.push('');
  lines.push(`H\u00F6g    ${bar(high)} ${high} (${pct(high)}%)`);
  lines.push(`Medel  ${bar(medium)} ${medium} (${pct(medium)}%)`);
  lines.push(`L\u00E5g    ${bar(low)} ${low} (${pct(low)}%)`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Build the Beslut (decisions) section of the digest markdown.
 */
function buildDecisionsSection(decisions: Decision[], fovSummary: string): string {
  if (decisions.length === 0) return '';

  const filtered = getDigestDecisions(decisions);
  if (filtered.length === 0) return '';

  const lines: string[] = [];
  lines.push('');
  lines.push('## Beslut');
  lines.push('');

  // Insert confidence histogram (uses ALL decisions, not filtered)
  const histogram = buildConfidenceHistogram(decisions);
  if (histogram) {
    lines.push(histogram);
  }

  // Count totals per agent before filtering
  const totalByAgent = new Map<string, number>();
  for (const d of decisions) {
    const agent = d.agent || 'unknown';
    totalByAgent.set(agent, (totalByAgent.get(agent) || 0) + 1);
  }

  const agentDecisions = new Map<string, Decision[]>();
  for (const d of filtered) {
    const agent = d.agent || 'unknown';
    if (!agentDecisions.has(agent)) agentDecisions.set(agent, []);
    agentDecisions.get(agent)!.push(d);
  }

  for (const [agent, decs] of agentDecisions) {
    const capitalized = agent.charAt(0).toUpperCase() + agent.slice(1);
    lines.push(`${capitalized} fattade ${decs.length} beslut:`);
    for (const d of decs) {
      const emoji = d.confidence === 'high' ? '\u2705' : d.confidence === 'medium' ? '\u26A0\uFE0F' : '\uD83D\uDD34';
      const confText = d.confidence === 'high' ? 'h\u00F6g s\u00E4kerhet' : d.confidence === 'medium' ? 'viss os\u00E4kerhet' : 'l\u00E5g s\u00E4kerhet';
      lines.push(`- ${emoji} ${d.what} (${confText})`);
    }
    // Show how many were filtered
    const totalBefore = totalByAgent.get(agent) || 0;
    if (totalBefore > decs.length) {
      lines.push(`  (${totalBefore - decs.length} ytterligare \u00E5tg\u00E4rder filtrerade)`);
    }
    lines.push('');
  }

  if (fovSummary) {
    lines.push('### Synf\u00E4lt');
    lines.push('');
    lines.push(fovSummary);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main: generateDigest
// ---------------------------------------------------------------------------

/**
 * Read run artifacts and generate a markdown digest.
 * Writes digest.md to runDir and returns the markdown string.
 */
export async function generateDigest(runDir: string): Promise<string> {
  // Read all source files safely
  const metrics = await readJsonSafe<MetricsJson>(
    path.join(runDir, 'metrics.json'),
  );
  const usage = await readJsonSafe<UsageJson>(
    path.join(runDir, 'usage.json'),
  );
  const taskScores = await readJsonlSafe<TaskScoreLine>(
    path.join(runDir, 'task_scores.jsonl'),
  );
  const reportText = await readTextSafe(path.join(runDir, 'report.md'));
  const briefText = await readTextSafe(path.join(runDir, 'brief.md'));
  const taskPlanText = await readTextSafe(
    path.join(runDir, 'task_plan.md'),
  );
  const knowledgeText = await readTextSafe(
    path.join(runDir, 'knowledge.md'),
  );
  const auditText = await readTextSafe(path.join(runDir, 'audit.jsonl'));

  // Parse audit lines for extractHighlights
  const auditLines = auditText
    .trim()
    .split('\n')
    .filter(Boolean);

  // Derive data
  const runid =
    metrics?.runid ?? usage?.runid ?? path.basename(runDir);
  const briefTitle = parseBriefTitle(briefText);
  const plan = parseTaskPlan(taskPlanText);
  const completed = parseTaskScores(taskScores);
  const events = extractHighlights(auditLines);
  const learnings = extractLearnings(knowledgeText);
  const stoplight = extractStoplight(reportText);

  // Parse decisions from audit
  const parsedAuditEntries: DecisionAuditEntry[] = auditLines
    .map(line => { try { return JSON.parse(line) as DecisionAuditEntry; } catch { return null; } })
    .filter((e): e is DecisionAuditEntry => e !== null);

  const agentEvents: EventData[] = parsedAuditEntries.map(e => ({
    event: (e.tool ?? 'unknown') as string,
    data: e as unknown as Record<string, unknown>,
    timestamp: e.ts ?? '',
  }));

  // Extract thinking from audit entries
  const thinkingTexts = parsedAuditEntries
    .filter(e => e.tool === 'agent:thinking' || (e as Record<string, unknown>).event === 'agent:thinking')
    .map(e => ((e as Record<string, unknown>).text ?? e.note ?? '') as string);
  const thinkingText = thinkingTexts.join('\n\n');

  const decisions = extractDecisions(thinkingText, parsedAuditEntries, agentEvents, runid);

  // Capture field of view for primary agent (manager)
  const fov = captureFieldOfView('manager', parsedAuditEntries as FovAuditEntry[]);
  const fovSummary = summarizeFieldOfView(fov);

  // Timing
  const startedAt = metrics?.timing?.started_at ?? '';
  const completedAt = metrics?.timing?.completed_at ?? '';
  const durationSec = metrics?.timing?.duration_seconds ?? 0;

  // Tokens
  const totalInput =
    metrics?.tokens?.total_input ??
    usage?.total_input_tokens ??
    0;
  const totalOutput =
    metrics?.tokens?.total_output ??
    usage?.total_output_tokens ??
    0;

  // Cost
  const costUsd = calcCost(totalInput, totalOutput, 'sonnet');

  // Code metrics
  const filesModified = metrics?.code?.files_modified ?? 0;
  const filesNew = metrics?.code?.files_new ?? 0;
  const insertions = metrics?.code?.insertions ?? 0;
  const deletions = metrics?.code?.deletions ?? 0;

  // Testing
  const baselinePassed = metrics?.testing?.baseline_passed ?? 0;
  const afterPassed = metrics?.testing?.after_passed ?? 0;
  const testsAdded = metrics?.testing?.tests_added ?? 0;

  // Format timing
  const dateStr = startedAt ? startedAt.slice(0, 10) : '';
  const startTime = startedAt ? startedAt.slice(11, 16) : '';
  const endTime = completedAt ? completedAt.slice(11, 16) : '';
  const durationStr = durationSec > 0 ? formatDuration(durationSec) : '';

  const md = buildMarkdown({
    runid,
    briefTitle,
    dateStr,
    startTime,
    endTime,
    durationStr,
    stoplight,
    costUsd,
    testsAdded,
    plan,
    completed,
    events,
    filesModified,
    filesNew,
    insertions,
    deletions,
    baselinePassed,
    afterPassed,
    totalInput,
    totalOutput,
    learnings,
    decisionsSection: buildDecisionsSection(decisions, fovSummary),
  });

  // Write digest.md
  await fs.writeFile(path.join(runDir, 'digest.md'), md, 'utf-8');

  return md;
}

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

interface MarkdownParams {
  runid: string;
  briefTitle: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  durationStr: string;
  stoplight: string;
  costUsd: number;
  testsAdded: number;
  plan: TaskInfo[];
  completed: TaskResult[];
  events: DigestEvent[];
  filesModified: number;
  filesNew: number;
  insertions: number;
  deletions: number;
  baselinePassed: number;
  afterPassed: number;
  totalInput: number;
  totalOutput: number;
  learnings: string[];
  decisionsSection: string;
}

function buildMarkdown(p: MarkdownParams): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Körning ${p.runid} — ${p.briefTitle}`);

  // Summary line
  const timingParts: string[] = [];
  if (p.dateStr) timingParts.push(p.dateStr);
  if (p.startTime && p.endTime) {
    timingParts.push(`${p.startTime}–${p.endTime}`);
  }
  if (p.durationStr) timingParts.push(`(${p.durationStr})`);
  const timingStr = timingParts.join(' ');
  const emoji = stoplightEmoji(p.stoplight);
  const costStr = `$${p.costUsd.toFixed(2)}`;
  lines.push(
    `${timingStr} | ${emoji} ${p.stoplight} | ${costStr} | +${p.testsAdded} tester`,
  );
  lines.push('');

  // Plan
  lines.push('## Plan');
  if (p.plan.length > 0) {
    for (const task of p.plan) {
      lines.push(`- **${task.id}**: ${task.description}`);
    }
  } else {
    lines.push('Ingen uppgiftsplan tillgänglig.');
  }
  lines.push('');

  // Utfört
  lines.push('## Utfört');
  if (p.completed.length > 0) {
    for (const task of p.completed) {
      const icon = task.status === 'completed' ? '✅' : '❌';
      lines.push(`- ${icon} **${task.id}**: ${task.summary}`);
    }
  } else {
    lines.push('Inga uppgifter rapporterade.');
  }
  lines.push('');

  // Händelser
  lines.push('## Händelser');
  if (p.events.length > 0) {
    for (const event of p.events) {
      const ts = event.timestamp ? event.timestamp.slice(11, 19) : '';
      lines.push(`- ${ts} ${event.text}`);
    }
  } else {
    lines.push('- Inga anmärkningsvärda händelser');
  }
  lines.push('');

  // Resultat
  lines.push('## Resultat');
  lines.push(
    `- Filer: ${p.filesModified} modifierade, ${p.filesNew} nya (+${p.insertions} / -${p.deletions} rader)`,
  );
  lines.push(
    `- Tester: ${p.afterPassed} totalt (${p.baselinePassed} baseline + ${p.testsAdded} nya)`,
  );
  lines.push(`- Tokens: ${p.totalInput} in / ${p.totalOutput} ut`);
  lines.push('');

  // Lärdomar
  lines.push('## Lärdomar');
  if (p.learnings.length > 0) {
    for (const learning of p.learnings) {
      lines.push(`- ${learning}`);
    }
  } else {
    lines.push('Inga dokumenterade lärdomar.');
  }
  lines.push('');

  // Beslut (decisions section)
  if (p.decisionsSection) {
    lines.push(p.decisionsSection);
  }

  return lines.join('\n');
}
