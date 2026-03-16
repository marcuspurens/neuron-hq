/**
 * Decision extraction module for RT-3.
 * Parses thinking text, audit entries, and agent events to extract
 * structured decisions made during a run.
 *
 * PURE module — no EventBus imports, no file I/O.
 * All functions are deterministic given the same inputs.
 */

// ── Types ────────────────────────────────────────────────

export type DecisionType =
  | 'plan'
  | 'delegation'
  | 'tool_choice'
  | 'fix'
  | 'escalation'
  | 'review';

export interface Decision {
  id: string;
  timestamp: string;
  agent: string;
  type: DecisionType;
  what: string;
  why: string;
  alternatives?: string[];
  confidence: 'high' | 'medium' | 'low';
  outcome?: 'success' | 'failure' | 'partial' | 'pending';
  parentId?: string;
  thinkingSnippet?: string;
  auditRefs?: string[];
}

export interface AuditEntry {
  ts?: string;
  role?: string;
  agent?: string;
  tool?: string;
  allowed?: boolean;
  note?: string;
  target?: string;
  [key: string]: unknown;
}

export interface EventData {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface DecisionTree {
  root: Decision | null;
  children: Map<string, Decision[]>;
  orphans: Decision[];
}

// ── Constants ────────────────────────────────────────────

const MAX_SNIPPET_LENGTH = 500;

// ── Pattern Regexes ──────────────────────────────────────

const INTENT_PATTERN = /\b(?:I'll|I should|I need to|I will|Let me|I'm going to)\s+(.+?)(?:\.|$)/gim;
const REASON_PATTERN = /\b(?:Because|Therefore|Since|Due to|Given that)\s+(.+?)(?:\.|$)/gim;
const ALT_PATTERN = /\b(?:Instead of|Rather than|Could have|Alternatively|Another option)\s+(.+?)(?:\.|$)/gim;
const LOW_CONF_PATTERN = /\b(?:Unsure|Not sure|Uncertain|Maybe|Might|Perhaps)\b/i;
const HIGH_CONF_PATTERN = /\b(?:Confident|Clearly|Obviously|Definitely|Certainly)\b/i;
const DELEGATION_TOOL_PATTERN = /^delegate_to_/;

// ── Helpers ──────────────────────────────────────────────

/**
 * Truncate text to maxLen, appending '...' if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Format a sequence number as zero-padded 3-digit string.
 */
function padSeq(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Extract all regex matches from text, returning captured group 1.
 */
function extractAll(pattern: RegExp, text: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      results.push(match[1].trim());
    }
  }
  return results;
}

/**
 * Detect confidence level from text.
 */
function detectConfidence(text: string): 'high' | 'medium' | 'low' {
  if (LOW_CONF_PATTERN.test(text)) return 'low';
  if (HIGH_CONF_PATTERN.test(text)) return 'high';
  return 'medium';
}

/**
 * Infer decision type from an audit entry.
 */
function inferTypeFromAudit(entry: AuditEntry): DecisionType | null {
  if (entry.tool && DELEGATION_TOOL_PATTERN.test(entry.tool)) {
    return 'delegation';
  }
  if (entry.role === 'reviewer') {
    return 'review';
  }
  return null;
}

/**
 * Find audit entries whose timestamps are close to the intent text context.
 * Returns the ts values from matching audit entries.
 */
function correlateAuditRefs(
  auditEntries: AuditEntry[],
  _intentIndex: number,
): string[] {
  // Simple heuristic: return all audit timestamps as potential refs
  // A more sophisticated approach would use text position → time mapping
  return auditEntries
    .filter((e) => e.ts != null)
    .map((e) => e.ts as string);
}

// ── Main Functions ───────────────────────────────────────

/**
 * Extract decisions from thinking text, audit entries, and agent events.
 *
 * Uses heuristic pattern matching to identify:
 * - Intent patterns ("I'll...", "I should...") → decisions
 * - Reason patterns ("Because...", "Since...") → why field
 * - Alternative patterns ("Instead of...") → alternatives
 * - Confidence signals → confidence level
 * - Audit tool patterns → delegation/review types
 * - Fix patterns (same tool after failure) → fix type
 *
 * @param thinkingText - Raw thinking/reasoning text from the model
 * @param auditEntries - Parsed audit log entries
 * @param agentEvents - Agent lifecycle events
 * @param runid - Run identifier (defaults to 'unknown')
 * @param agentName - Agent name (defaults to 'unknown')
 * @returns Array of extracted Decision objects
 */
export function extractDecisions(
  thinkingText: string,
  auditEntries: AuditEntry[],
  agentEvents: EventData[],
  runid: string = 'unknown',
  agentName: string = 'unknown',
): Decision[] {
  const decisions: Decision[] = [];
  let seq = 0;

  // 1. Extract decisions from thinking text
  const intents = extractAll(INTENT_PATTERN, thinkingText);
  const reasons = extractAll(REASON_PATTERN, thinkingText);
  const alternatives = extractAll(ALT_PATTERN, thinkingText);
  const confidence = detectConfidence(thinkingText);

  for (const intent of intents) {
    seq++;
    const why = reasons.length > 0 ? reasons[0] : '';
    // Shift consumed reason so next decision gets next reason
    if (reasons.length > 0) reasons.shift();

    const snippet = truncate(intent, MAX_SNIPPET_LENGTH);

    const decision: Decision = {
      id: `d-${runid}-${padSeq(seq)}`,
      timestamp: new Date().toISOString(),
      agent: agentName,
      type: 'tool_choice',
      what: truncate(intent, 120),
      why: why || '',
      confidence,
      thinkingSnippet: snippet,
    };

    if (alternatives.length > 0) {
      decision.alternatives = [...alternatives];
    }

    decisions.push(decision);
  }

  // 2. Extract decisions from audit entries
  const failedTools = new Set<string>();

  for (const entry of auditEntries) {
    const auditType = inferTypeFromAudit(entry);
    if (!auditType) {
      // Track failed tools for fix detection
      if (entry.allowed === false && entry.tool) {
        failedTools.add(entry.tool);
      } else if (entry.tool && failedTools.has(entry.tool)) {
        // Same tool called after failure → fix
        seq++;
        decisions.push({
          id: `d-${runid}-${padSeq(seq)}`,
          timestamp: entry.ts || new Date().toISOString(),
          agent: entry.role || entry.agent || agentName,
          type: 'fix',
          what: `Retried ${entry.tool} after previous failure`,
          why: 'Previous attempt was blocked or failed',
          confidence: 'medium',
          auditRefs: entry.ts ? [entry.ts] : undefined,
        });
        failedTools.delete(entry.tool);
      }
      continue;
    }

    seq++;
    const what =
      auditType === 'delegation'
        ? `Delegated to ${entry.tool?.replace('delegate_to_', '') || 'agent'}`
        : `Review action: ${entry.tool || 'unknown'}`;

    decisions.push({
      id: `d-${runid}-${padSeq(seq)}`,
      timestamp: entry.ts || new Date().toISOString(),
      agent: entry.role || entry.agent || agentName,
      type: auditType,
      what,
      why: entry.note || '',
      confidence: 'medium',
      auditRefs: entry.ts ? [entry.ts] : undefined,
    });
  }

  // 3. Extract plan decisions from agent events
  for (const event of agentEvents) {
    if (event.event === 'plan_created' || event.event === 'brief_split') {
      seq++;
      const taskCount =
        typeof event.data.taskCount === 'number' ? event.data.taskCount : '?';
      decisions.push({
        id: `d-${runid}-${padSeq(seq)}`,
        timestamp: event.timestamp,
        agent: (event.data.agent as string) || agentName,
        type: 'plan',
        what: `Created plan with ${taskCount} tasks`,
        why: (event.data.reason as string) || '',
        confidence: 'medium',
      });
    }

    if (event.event === 'escalation') {
      seq++;
      decisions.push({
        id: `d-${runid}-${padSeq(seq)}`,
        timestamp: event.timestamp,
        agent: (event.data.agent as string) || agentName,
        type: 'escalation',
        what: `Escalated: ${(event.data.reason as string) || 'unknown reason'}`,
        why: (event.data.reason as string) || '',
        confidence: 'low',
      });
    }
  }

  // 4. Correlate audit refs for thinking-derived decisions
  if (auditEntries.length > 0) {
    const allRefs = correlateAuditRefs(auditEntries, 0);
    for (const d of decisions) {
      if (!d.auditRefs && allRefs.length > 0) {
        d.auditRefs = allRefs;
      }
    }
  }

  return decisions;
}

/**
 * Build a decision tree by linking decisions via parentId.
 *
 * Linking rules:
 * - The first 'plan' decision becomes the root
 * - 'delegation' decisions become children of the plan root
 * - 'tool_choice' decisions become children of their agent's delegation
 * - 'fix' decisions become children of their agent's delegation
 * - 'review' decisions become children of the plan root
 * - 'escalation' decisions become children of their agent's delegation
 * - Decisions with no linkable parent go into orphans
 *
 * @param decisions - Array of Decision objects to organize
 * @returns DecisionTree with root, children map, and orphans
 */
export function buildDecisionChain(decisions: Decision[]): DecisionTree {
  const tree: DecisionTree = {
    root: null,
    children: new Map<string, Decision[]>(),
    orphans: [],
  };

  if (decisions.length === 0) {
    return tree;
  }

  // Find the plan root (first plan decision)
  const planDecision = decisions.find((d) => d.type === 'plan');
  if (planDecision) {
    tree.root = planDecision;
  }

  // Build agent → delegation map
  const agentDelegation = new Map<string, Decision>();
  for (const d of decisions) {
    if (d.type === 'delegation') {
      // Extract target agent from 'what' field
      const match = d.what.match(/Delegated to (\w+)/);
      if (match) {
        agentDelegation.set(match[1].toLowerCase(), d);
      }
    }
  }

  // Link decisions
  for (const d of decisions) {
    // Root is already placed
    if (d === tree.root) continue;

    // Already has a parentId? Use it
    if (d.parentId) {
      const existing = tree.children.get(d.parentId) || [];
      existing.push(d);
      tree.children.set(d.parentId, existing);
      continue;
    }

    // Delegations are children of the plan
    if (d.type === 'delegation' && tree.root) {
      d.parentId = tree.root.id;
      const existing = tree.children.get(tree.root.id) || [];
      existing.push(d);
      tree.children.set(tree.root.id, existing);
      continue;
    }

    // Review decisions are children of the plan
    if (d.type === 'review' && tree.root) {
      d.parentId = tree.root.id;
      const existing = tree.children.get(tree.root.id) || [];
      existing.push(d);
      tree.children.set(tree.root.id, existing);
      continue;
    }

    // Tool choice, fix, escalation → child of agent's delegation
    if (
      (d.type === 'tool_choice' || d.type === 'fix' || d.type === 'escalation') &&
      d.agent
    ) {
      const delegation = agentDelegation.get(d.agent.toLowerCase());
      if (delegation) {
        d.parentId = delegation.id;
        const existing = tree.children.get(delegation.id) || [];
        existing.push(d);
        tree.children.set(delegation.id, existing);
        continue;
      }
    }

    // No parent found → orphan (but if root exists, try attaching to root)
    if (tree.root && d !== tree.root) {
      // Last resort: attach to root if no specific parent found
      tree.orphans.push(d);
    } else {
      tree.orphans.push(d);
    }
  }

  return tree;
}


// ── Digest Helpers ───────────────────────────────────────

/** Keywords that indicate a review decision contains an actual verdict. */
const REVIEW_VERDICT_PATTERN =
  /(?:Approved|Rejected|verdict|MERGE|ITERATE|INVESTIGATE)/i;

/**
 * Filter decisions to keep only significant ones (not tool calls or
 * repetitive reviewer commands).
 *
 * Rules:
 * - Filter OUT type 'tool_choice' entirely
 * - Filter OUT type 'review' where 'what' starts with 'Review action:'
 * - Keep type 'review' only if 'what' matches a verdict keyword
 * - Keep 'plan', 'delegation', 'fix', and 'escalation' as-is
 *
 * @param decisions - Array of Decision objects to filter
 * @returns Filtered array containing only significant decisions
 */
export function filterSignificantDecisions(decisions: Decision[]): Decision[] {
  return decisions.filter((d) => {
    if (d.type === 'tool_choice') return false;

    if (d.type === 'review') {
      if (d.what.startsWith('Review action:')) return false;
      return REVIEW_VERDICT_PATTERN.test(d.what);
    }

    // Keep plan, delegation, fix, escalation
    return true;
  });
}

/**
 * Aggregate repetitive decisions into summary entries.
 *
 * Groups decisions by (agent, type, what-prefix) where what-prefix is the
 * first 30 characters of 'what'. Groups with >2 decisions are replaced
 * with a single summary. Groups with <=2 pass through unchanged.
 *
 * @param decisions - Array of Decision objects to aggregate
 * @returns Array with repetitive groups collapsed into summaries
 */
export function aggregateRepetitive(decisions: Decision[]): Decision[] {
  const groupKey = (d: Decision): string =>
    `${d.agent}|${d.type}|${d.what.slice(0, 30)}`;

  // Preserve insertion order
  const groups = new Map<string, Decision[]>();
  for (const d of decisions) {
    const key = groupKey(d);
    const arr = groups.get(key) || [];
    arr.push(d);
    groups.set(key, arr);
  }

  const result: Decision[] = [];
  for (const members of groups.values()) {
    if (members.length <= 2) {
      result.push(...members);
      continue;
    }

    // Find most common confidence
    const counts = new Map<string, number>();
    for (const m of members) {
      counts.set(m.confidence, (counts.get(m.confidence) || 0) + 1);
    }
    let bestConf: Decision['confidence'] = 'medium';
    let bestCount = 0;
    for (const [conf, cnt] of counts) {
      if (cnt > bestCount) {
        bestCount = cnt;
        bestConf = conf as Decision['confidence'];
      }
    }

    const first = members[0];
    result.push({
      ...first,
      what: `${first.agent} k\u00F6rde ${members.length} ${first.type}-\u00E5tg\u00E4rder`,
      confidence: bestConf,
    });
  }

  return result;
}

/**
 * Produce a concise list of digest-worthy decisions.
 *
 * Chains: filterSignificantDecisions -> aggregateRepetitive -> slice(0, maxCount).
 *
 * @param decisions - Raw decisions from extractDecisions
 * @param maxCount - Maximum number of decisions to return (default 15)
 * @returns At most maxCount significant, de-duplicated decisions
 */
export function getDigestDecisions(
  decisions: Decision[],
  maxCount: number = 15,
): Decision[] {
  const significant = filterSignificantDecisions(decisions);
  const aggregated = aggregateRepetitive(significant);
  return aggregated.slice(0, maxCount);
}
