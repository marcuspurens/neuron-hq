/**
 * Pure module that translates EventBus events to Swedish natural language.
 * No imports from event-bus.ts — just string processing.
 */

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
