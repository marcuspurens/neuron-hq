/**
 * Pure module that translates EventBus events to Swedish natural language.
 * Includes decision narration and automation bias warnings.
 */

import type { Decision } from './decision-extractor.js';

/** Events that only update header/panels and should NOT appear in the narrative log. */
const NON_LOG_EVENTS = new Set(['tokens', 'time', 'iteration', 'agent:text']);

/**
 * Capitalize an agent name: 'manager' → 'Manager'.
 */
function capitalize(name: unknown): string {
  if (typeof name !== 'string' || name.length === 0) return 'Unknown';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Truncate a string to maxLen characters, appending '...' if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Check if an event type should be displayed in the narrative event log.
 * Some events (tokens, time, iteration, agent:text) only update header/panels.
 */
export function isLogWorthy(event: string): boolean {
  return !NON_LOG_EVENTS.has(event);
}

/**
 * Translate an event to a Swedish natural-language string for the narrative log.
 * Returns null if the event should NOT appear in the log (header-only events).
 */
export function narrateEvent(event: string, data: Record<string, unknown>): string | null {
  switch (event) {
    case 'run:start':
      return `🚀 Körning startad: ${data.target ?? 'okänt'} (${data.hours ?? '?'} timme)`;

    case 'run:end':
      return `🏁 Körning avslutad (${data.duration ?? '?'}s)`;

    case 'agent:start': {
      const agent = capitalize(data.agent);
      if (data.taskId) {
        return `👷 ${agent} tar uppgift ${data.taskId}: ${data.task ?? ''}`;
      }
      return `📋 ${agent} börjar arbeta`;
    }

    case 'agent:end': {
      const agent = capitalize(data.agent);
      if (data.error) {
        return `❌ ${agent} avslutad med fel: ${data.error}`;
      }
      return `✅ ${agent} klar`;
    }

    case 'agent:text':
      return null;

    case 'agent:thinking':
      return `🧠 ${capitalize(data.agent)} resonerar...`;

    case 'iteration':
      return null;

    case 'task:status':
      return narrateTaskStatus(data);

    case 'stoplight':
      return narrateStoplight(data);

    case 'tokens':
      return null;

    case 'time':
      return null;

    case 'audit':
      return narrateAudit(data);

    case 'decision':
      if (data.decision && typeof data.decision === 'object') {
        return narrateDecision(data.decision as Decision);
      }
      return '📊 Beslut fattat';

    default:
      return `⚡ ${event}: ${JSON.stringify(data)}`;
  }
}

/**
 * Translate task:status events to Swedish.
 */
function narrateTaskStatus(data: Record<string, unknown>): string {
  const taskId = data.taskId ?? '?';
  switch (data.status) {
    case 'running':
      return `🔄 Uppgift ${taskId} startar`;
    case 'completed':
      return `✅ Uppgift ${taskId} klar`;
    case 'failed':
      return `❌ Uppgift ${taskId} misslyckades`;
    default:
      return `📌 Uppgift ${taskId}: ${data.status ?? 'okänd status'}`;
  }
}

/**
 * Translate stoplight events to Swedish.
 */
function narrateStoplight(data: Record<string, unknown>): string {
  switch (data.status) {
    case 'GREEN':
      return '🟢 STOPLIGHT: GREEN — körningen godkänd';
    case 'YELLOW':
      return '🟡 STOPLIGHT: YELLOW — körningen delvis godkänd';
    case 'RED':
      return '🔴 STOPLIGHT: RED — körningen underkänd';
    default:
      return `🚦 STOPLIGHT: ${data.status ?? 'UNKNOWN'}`;
  }
}

/**
 * Translate audit events to Swedish. Only delegation and blocked events are log-worthy.
 */
function narrateAudit(data: Record<string, unknown>): string | null {
  if (data.delegation || data.target) {
    const role = capitalize(data.role ?? data.agent);
    const target = capitalize(data.target);
    return `📤 ${role} → ${target}: delegering`;
  }

  if (data.allowed === false) {
    return `🚫 Policy blockerade: ${data.reason ?? 'okänd anledning'}`;
  }

  return null;
}

/**
 * Narrate a Decision in Swedish with confidence-based emoji and language.
 *
 * - high confidence:   "✅ {Agent} {what} (säkert beslut)"
 * - medium confidence: "⚠️ {Agent} {what} (viss osäkerhet)"
 * - low confidence:    "🔴 {Agent} {what} (osäkert beslut)"
 *
 * If decision.why exists, appends " — {why}".
 */
export function narrateDecision(decision: Decision): string {
  const agent = capitalize(decision.agent);
  const what = decision.what;

  let result: string;
  switch (decision.confidence) {
    case 'high':
      result = `✅ ${agent} ${what} (säkert beslut)`;
      break;
    case 'medium':
      result = `⚠️ ${agent} ${what} (viss osäkerhet)`;
      break;
    case 'low':
      result = `🔴 ${agent} ${what} (osäkert beslut)`;
      break;
  }

  if (decision.why) {
    result += ` — ${decision.why}`;
  }

  return result;
}

/**
 * Return an automation bias warning in Swedish, or null if no warning applies.
 *
 * Checks:
 * 1. Low confidence + non-pending outcome → agent acted despite uncertainty
 * 2. Fix type without explanation → strategy change without reason
 * 3. Plan type without alternatives → no alternatives considered
 */
export function automationBiasWarning(decision: Decision): string | null {
  if (decision.confidence === 'low' && decision.outcome && decision.outcome !== 'pending') {
    return 'OBS: Agenten agerade trots låg säkerhet';
  }

  if (decision.type === 'fix' && !decision.why) {
    return 'OBS: Agenten ändrade strategi utan förklaring';
  }

  if (
    decision.type === 'plan' &&
    (!decision.alternatives || decision.alternatives.length === 0)
  ) {
    return '⚠️ Inga alternativ övervägdes för detta planeringsbeslut';
  }

  return null;
}

/**
 * Simplified decision narration for non-technical users.
 *
 * Uses truncated 'what' (max 60 chars) and simpler confidence language:
 * - high:   "Agenten {what} (lyckas oftast)"
 * - medium: "Agenten {what} (går oftast bra)"
 * - low:    "Agenten {what} (osäkert — kan misslyckas)"
 */
export function narrateDecisionSimple(decision: Decision): string {
  const simplifiedWhat = truncate(decision.what, 60);

  switch (decision.confidence) {
    case 'high':
      return `Agenten ${simplifiedWhat} (lyckas oftast)`;
    case 'medium':
      return `Agenten ${simplifiedWhat} (går oftast bra)`;
    case 'low':
      return `Agenten ${simplifiedWhat} (osäkert — kan misslyckas)`;
  }
}
