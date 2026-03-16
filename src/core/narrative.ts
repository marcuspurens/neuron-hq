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
 * Strip everything up to and including '/neuron-hq/' from a filepath.
 * E.g. '/Users/x/workspaces/123/neuron-hq/src/core/foo.ts' → 'src/core/foo.ts'.
 * If no '/neuron-hq/' is found, returns the original path.
 */
export function stripWorkspacePath(filepath: string): string {
  const marker = '/neuron-hq/';
  const idx = filepath.lastIndexOf(marker);
  if (idx === -1) return filepath;
  return filepath.slice(idx + marker.length);
}

/** Structured audit narration with two detail levels. */
export interface AuditNarration {
  /** Always-visible summary line. */
  level1: string;
  /** Expanded detail key-value pairs. */
  level2: Record<string, string>;
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
 * Translate audit events to Swedish.
 * Delegation and blocked events keep their existing behavior.
 * All other audit tool types now get narrated via narrateAuditEvent().
 */
function narrateAudit(data: Record<string, unknown>): string | null {
  // Existing behavior: delegation events
  if (data.delegation || data.target) {
    const role = capitalize(data.role ?? data.agent);
    const target = capitalize(data.target);
    return `📤 ${role} → ${target}: delegering`;
  }

  // Existing behavior: blocked events
  if (data.allowed === false) {
    return `🚫 Policy blockerade: ${data.reason ?? 'okänd anledning'}`;
  }

  // New: try structured narration and return level1 summary
  const narration = narrateAuditEvent(data);
  if (narration) {
    return narration.level1;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers for narrateAuditEvent
// ---------------------------------------------------------------------------

/** Extract the agent display name from audit data. */
function agentName(data: Record<string, unknown>): string {
  return capitalize(data.role ?? data.agent);
}

/** Get the first file path from display_files or files_touched, stripped. */
function firstFile(data: Record<string, unknown>): string {
  const displayFiles = data.display_files;
  if (Array.isArray(displayFiles) && displayFiles.length > 0) {
    return String(displayFiles[0]);
  }
  const files = data.files_touched;
  if (Array.isArray(files) && files.length > 0) {
    return stripWorkspacePath(String(files[0]));
  }
  return 'okänd fil';
}

/** Get the bash command from display_command or note. */
function bashCommand(data: Record<string, unknown>): string {
  if (typeof data.display_command === 'string') return data.display_command;
  if (typeof data.note === 'string') return data.note;
  return 'okänt kommando';
}

/** Extract just the filename from a path. */
function filename(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/** Format diff stats as a string. */
function formatDiffStats(data: Record<string, unknown>): string {
  const stats = data.diff_stats as { additions?: number; deletions?: number } | undefined;
  if (!stats) return 'inga ändringar';
  const parts: string[] = [];
  if (stats.additions) parts.push(`+${stats.additions}`);
  if (stats.deletions) parts.push(`-${stats.deletions}`);
  return parts.length > 0 ? parts.join(', ') : 'inga ändringar';
}

/** Format timestamp from audit data. */
function formatTime(data: Record<string, unknown>): string {
  if (typeof data.ts === 'string') {
    // Extract HH:MM:SS from ISO timestamp
    const match = data.ts.match(/T(\d{2}:\d{2}:\d{2})/);
    if (match) return match[1];
    return data.ts;
  }
  return 'okänd tid';
}

// ---------------------------------------------------------------------------
// narrateAuditEvent — structured narration for all audit tool types
// ---------------------------------------------------------------------------

/**
 * Generate structured narration for an audit event.
 * Returns AuditNarration with level1 (summary) and level2 (details), or null
 * if the tool type is not recognized.
 */
export function narrateAuditEvent(data: Record<string, unknown>): AuditNarration | null {
  const tool = typeof data.tool === 'string' ? data.tool : '';
  const agent = agentName(data);

  switch (tool) {
    case 'read_file': {
      const file = firstFile(data);
      return {
        level1: `📖 ${agent} läser ${filename(file)}`,
        level2: { fil: file, agent, tid: formatTime(data) },
      };
    }

    case 'write_file': {
      const file = firstFile(data);
      const stats = data.diff_stats as { additions?: number } | undefined;
      const additions = stats?.additions ?? 0;
      return {
        level1: `✏️ ${agent} skriver ${filename(file)} (+${additions} rader)`,
        level2: { fil: file, diff_stats: formatDiffStats(data), agent },
      };
    }

    case 'bash_exec': {
      const cmd = bashCommand(data);
      const exitCode = typeof data.exit_code === 'number' ? String(data.exit_code) : 'okänd';
      return {
        level1: `⚡ ${agent} kör: ${truncate(cmd, 60)}`,
        level2: { kommando: cmd, exit_code: exitCode, agent },
      };
    }

    case 'graph_query': {
      const query = typeof data.note === 'string' ? data.note : '';
      const count = typeof data.count === 'number' ? String(data.count) : '0';
      return {
        level1: `🔍 ${agent} söker i kunskapsgrafen`,
        level2: { sökfråga: query, antal: count },
      };
    }

    case 'search_memory': {
      const query = typeof data.note === 'string' ? data.note : '';
      const count = typeof data.count === 'number' ? String(data.count) : '0';
      return {
        level1: `🧠 ${agent} söker minnet: "${truncate(query, 60)}"`,
        level2: { sökterm: query, antal: count },
      };
    }

    case 'write_task_plan': {
      const note = typeof data.note === 'string' ? data.note : '';
      const taskCount = typeof data.task_count === 'number'
        ? data.task_count
        : (note.match(/(\d+)/) ? Number(note.match(/(\d+)/)![1]) : 0);
      return {
        level1: `📋 ${agent} skapar plan med ${taskCount} uppgifter`,
        level2: { uppgiftslista: note },
      };
    }

    case 'delegate_parallel_wave': {
      const waveNum = typeof data.wave === 'number' ? data.wave : '?';
      const tasks = typeof data.note === 'string' ? data.note : '';
      return {
        level1: `🌊 ${agent} startar Wave ${waveNum}: ${truncate(tasks, 60)}`,
        level2: { uppgiftsdetaljer: tasks },
      };
    }

    case 'copy_to_target': {
      const file = firstFile(data);
      const dest = typeof data.destination === 'string'
        ? stripWorkspacePath(data.destination)
        : file;
      return {
        level1: `📁 ${agent} kopierar fil till target-repo`,
        level2: { källsökväg: file, målsökväg: dest },
      };
    }

    case 'adaptive_hints': {
      const warnings = typeof data.warnings === 'number' ? data.warnings : 0;
      const strengths = typeof data.strengths === 'number' ? data.strengths : 0;
      const note = typeof data.note === 'string' ? data.note : '';
      return {
        level1: `💡 ${agent} får ${warnings} varningar, ${strengths} styrkor`,
        level2: { lista: note },
      };
    }

    case 'agent_message': {
      const message = typeof data.note === 'string' ? data.note : '';
      return {
        level1: `💬 ${agent}: "${truncate(message, 60)}"`,
        level2: { meddelande: message },
      };
    }

    default: {
      // Handle delegate_to_* pattern
      if (tool.startsWith('delegate_to_')) {
        const target = capitalize(tool.replace('delegate_to_', ''));
        const desc = typeof data.note === 'string' ? data.note : '';
        return {
          level1: `📤 ${agent} → ${target}: "${truncate(desc, 60)}"`,
          level2: { 'fullständig beskrivning': desc },
        };
      }

      // Handle 'run' tool with phase === 'start'
      if (tool === 'run' && data.phase === 'start') {
        const desc = typeof data.note === 'string' ? data.note : '';
        return {
          level1: `🚀 ${agent} startar — "${truncate(desc, 60)}"`,
          level2: { 'fullständig text': desc },
        };
      }

      return null;
    }
  }
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
