/**
 * Langfuse observability for Neuron HQ.
 *
 * Provides tracing for agent runs — each run becomes a Langfuse trace,
 * each agent becomes a span, each LLM call becomes a generation.
 *
 * Usage:
 *   initLangfuse()           — call once at startup
 *   createRunTrace(runid)    — creates a trace for a run
 *   getRunTrace(runid)       — gets the trace for a run
 *   registerEventBusListeners() — auto-trace via EventBus events
 *   shutdownLangfuse()       — flush and close at exit
 */

import Langfuse from 'langfuse';
import type { eventBus as EventBusType } from './event-bus.js';

type LangfuseTrace = ReturnType<Langfuse['trace']>;
type LangfuseSpan = ReturnType<LangfuseTrace['span']>;

let langfuse: Langfuse | null = null;
const runTraces = new Map<string, LangfuseTrace>();
const agentSpans = new Map<string, LangfuseSpan>();

function spanKey(runid: string, agent: string): string {
  return `${runid}:${agent}`;
}

export function initLangfuse(): void {
  if (langfuse) return;
  if (process.env.LANGFUSE_ENABLED === 'false') return;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL || 'http://localhost:3000';

  if (!publicKey || !secretKey) return;

  langfuse = new Langfuse({ publicKey, secretKey, baseUrl });
}

/**
 * Create a Langfuse trace for a Neuron HQ run.
 */
export function createRunTrace(runid: string, metadata?: {
  brief?: string;
  briefTitle?: string;
  target?: string;
  hours?: number;
}): LangfuseTrace | null {
  if (!langfuse) return null;

  const trace = langfuse.trace({
    name: metadata?.briefTitle || runid,
    id: runid,
    metadata: {
      runid,
      target: metadata?.target,
      hours: metadata?.hours,
      briefTitle: metadata?.briefTitle,
    },
    input: metadata?.brief ? { brief: metadata.brief.slice(0, 2000) } : undefined,
    tags: [metadata?.target || 'unknown'],
  });

  runTraces.set(runid, trace);
  return trace;
}

/**
 * Get the Langfuse trace for a run (if it exists).
 */
export function getRunTrace(runid: string): LangfuseTrace | null {
  return runTraces.get(runid) ?? null;
}

/**
 * Register EventBus listeners that auto-create Langfuse spans and generations.
 * Call this once after initLangfuse().
 */
export function registerEventBusListeners(bus: typeof EventBusType): void {
  if (!langfuse) return;

  // Agent start → create span
  bus.on('agent:start', (data) => {
    const trace = runTraces.get(data.runid);
    if (!trace) return;

    const span = trace.span({
      name: data.agent,
      metadata: { agent: data.agent, role: data.role },
    });
    agentSpans.set(spanKey(data.runid, data.agent), span);
  });

  // Agent end → close span
  bus.on('agent:end', (data) => {
    const key = spanKey(data.runid, data.agent);
    const span = agentSpans.get(key);
    if (span) {
      span.end();
      agentSpans.delete(key);
    }
  });

  // Tokens → log as generation on the agent's span
  bus.on('tokens', (data) => {
    const key = spanKey(data.runid, data.agent);
    const parent = agentSpans.get(key) ?? runTraces.get(data.runid);
    if (!parent) return;

    parent.generation({
      name: `${data.agent}-llm`,
      model: data.model || 'claude-sonnet-4-5-20250929',
      usage: {
        input: data.input,
        output: data.output,
      },
      metadata: { agent: data.agent },
    });
  });

  // Stoplight → score the trace
  bus.on('stoplight', (data) => {
    const trace = runTraces.get(data.runid);
    if (!trace) return;

    trace.score({
      name: 'stoplight',
      value: data.status === 'GREEN' ? 1 : data.status === 'YELLOW' ? 0.5 : 0,
      comment: data.status,
    });
  });
}

export async function shutdownLangfuse(): Promise<void> {
  if (langfuse) {
    await langfuse.flushAsync();
    await langfuse.shutdownAsync();
    langfuse = null;
    runTraces.clear();
    agentSpans.clear();
  }
}
