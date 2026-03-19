/**
 * Lightweight module that subscribes to EventBus events and collects them
 * as NarrativeEntry[]. Does NO heavy processing during the run — just
 * collect and store.
 */

import { eventBus } from './event-bus.js';
import { narrateEvent, narrateDecisionSimple } from './narrative.js';
import type { Decision } from './decision-extractor.js';

// ── Types ────────────────────────────────────────────────

export interface NarrativeEntry {
  ts: string;            // ISO timestamp
  agent: string;         // which agent
  type: 'decision' | 'action' | 'finding' | 'warning' | 'status';
  summary: string;       // one sentence, Swedish (from narrative.ts)
  detail?: string;       // extended detail (auto-truncated to max 200 chars)
  decisionRef?: string;  // link to Decision if applicable
}

// ── Constants ────────────────────────────────────────────

const MAX_ENTRIES = 500;
const MAX_DETAIL_LENGTH = 200;

// ── Helpers ──────────────────────────────────────────────

/** Truncate a string to maxLen characters, appending '...' if truncated. */
function truncateDetail(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/** Extract agent name from event data. */
function extractAgent(data: Record<string, unknown>): string {
  return String(data.role ?? data.agent ?? 'unknown');
}

// ── Class ────────────────────────────────────────────────

/**
 * Subscribes to EventBus events and collects them as NarrativeEntry[].
 *
 * Usage:
 * ```ts
 * const collector = new NarrativeCollector();
 * collector.start('run-123');
 * // ... run happens ...
 * collector.stop();
 * const entries = collector.getEntries();
 * ```
 */
export class NarrativeCollector {
  private entries: NarrativeEntry[] = [];
  private stopped = false;

  // Named handler references for unsubscription
  private handleAgentStart: ((data: unknown) => void) | null = null;
  private handleAgentEnd: ((data: unknown) => void) | null = null;
  private handleDecision: ((data: unknown) => void) | null = null;
  private handleTaskPlan: ((data: unknown) => void) | null = null;
  private handleTaskStatus: ((data: unknown) => void) | null = null;
  private handleAudit: ((data: unknown) => void) | null = null;
  private handleWarning: ((data: unknown) => void) | null = null;
  private handleStoplight: ((data: unknown) => void) | null = null;

  /**
   * Subscribe to EventBus events and start collecting entries.
   */
  start(_runid: string): void {
    this.stopped = false;
    this.entries = [];

    this.handleAgentStart = (data: unknown) => {
      this.addFromEvent('agent:start', data as Record<string, unknown>, 'action');
    };

    this.handleAgentEnd = (data: unknown) => {
      this.addFromEvent('agent:end', data as Record<string, unknown>, 'action');
    };

    this.handleDecision = (data: unknown) => {
      this.addDecision(data as Record<string, unknown>);
    };

    this.handleTaskPlan = (data: unknown) => {
      this.addFromEvent('task:plan', data as Record<string, unknown>, 'action');
    };

    this.handleTaskStatus = (data: unknown) => {
      this.addFromEvent('task:status', data as Record<string, unknown>, 'action');
    };

    this.handleAudit = (data: unknown) => {
      this.addAudit(data as Record<string, unknown>);
    };

    this.handleWarning = (data: unknown) => {
      this.addFromEvent('warning', data as Record<string, unknown>, 'warning');
    };

    this.handleStoplight = (data: unknown) => {
      this.addFromEvent('stoplight', data as Record<string, unknown>, 'status');
    };

    eventBus.on('agent:start', this.handleAgentStart);
    eventBus.on('agent:end', this.handleAgentEnd);
    eventBus.on('decision', this.handleDecision);
    eventBus.on('task:plan', this.handleTaskPlan);
    eventBus.on('task:status', this.handleTaskStatus);
    eventBus.on('audit', this.handleAudit);
    eventBus.on('warning', this.handleWarning);
    eventBus.on('stoplight', this.handleStoplight);
  }

  /**
   * Unsubscribe all listeners and freeze the entries list.
   */
  stop(): void {
    if (this.handleAgentStart) eventBus.off('agent:start', this.handleAgentStart);
    if (this.handleAgentEnd) eventBus.off('agent:end', this.handleAgentEnd);
    if (this.handleDecision) eventBus.off('decision', this.handleDecision);
    if (this.handleTaskPlan) eventBus.off('task:plan', this.handleTaskPlan);
    if (this.handleTaskStatus) eventBus.off('task:status', this.handleTaskStatus);
    if (this.handleAudit) eventBus.off('audit', this.handleAudit);
    if (this.handleWarning) eventBus.off('warning', this.handleWarning);
    if (this.handleStoplight) eventBus.off('stoplight', this.handleStoplight);

    this.handleAgentStart = null;
    this.handleAgentEnd = null;
    this.handleDecision = null;
    this.handleTaskPlan = null;
    this.handleTaskStatus = null;
    this.handleAudit = null;
    this.handleWarning = null;
    this.handleStoplight = null;

    this.stopped = true;
  }

  /**
   * Return all entries in chronological order.
   */
  getEntries(): NarrativeEntry[] {
    return [...this.entries];
  }

  /**
   * Return entries filtered by agent role.
   */
  getEntriesByAgent(role: string): NarrativeEntry[] {
    return this.entries.filter((e) => e.agent === role);
  }

  // ── Private helpers ──────────────────────────────────

  /** Add an entry, enforcing max size and stopped state. */
  private push(entry: NarrativeEntry): void {
    if (this.stopped) return;
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
  }

  /** Create an entry from a generic event using narrateEvent(). */
  private addFromEvent(
    event: string,
    data: Record<string, unknown>,
    type: NarrativeEntry['type'],
  ): void {
    const summary = narrateEvent(event, data);
    if (summary === null) return;

    const detail = typeof data.result === 'string'
      ? data.result
      : typeof data.error === 'string'
        ? data.error
        : typeof data.message === 'string'
          ? data.message
          : typeof data.description === 'string'
            ? data.description
            : undefined;

    this.push({
      ts: new Date().toISOString(),
      agent: extractAgent(data),
      type,
      summary,
      ...(detail !== undefined && {
        detail: truncateDetail(detail, MAX_DETAIL_LENGTH),
      }),
    });
  }

  /** Handle decision events using narrateDecisionSimple(). */
  private addDecision(data: Record<string, unknown>): void {
    const decision = data.decision as Decision | undefined;
    if (!decision) return;

    const summary = narrateDecisionSimple(decision);

    this.push({
      ts: new Date().toISOString(),
      agent: extractAgent(data),
      type: 'decision',
      summary,
      decisionRef: decision.id,
    });
  }

  /** Handle audit events — only collect if allowed: true AND has note or files_touched. */
  private addAudit(data: Record<string, unknown>): void {
    if (data.allowed !== true) return;
    if (!data.note && !data.files_touched) return;

    const summary = narrateEvent('audit', data);
    if (summary === null) return;

    const detail = typeof data.note === 'string' ? data.note : undefined;

    this.push({
      ts: new Date().toISOString(),
      agent: extractAgent(data),
      type: 'action',
      summary,
      ...(detail !== undefined && {
        detail: truncateDetail(detail, MAX_DETAIL_LENGTH),
      }),
    });
  }
}
