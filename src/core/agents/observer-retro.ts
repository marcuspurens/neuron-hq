/**
 * observer-retro.ts — Retro conversation module for ObserverAgent.
 *
 * Runs short post-run conversations with each agent to collect reflections
 * on what went well/poorly. Never modifies anything — read-only observation.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { createAgentClient } from '../agent-client.js';
import { resolveModelConfig } from '../model-registry.js';
import type { AgentModelMap } from '../model-registry.js';
import { calcCost, getModelShortName } from '../pricing.js';
import { createLogger } from '../logger.js';
import type { Observation } from './observer.js';

const logger = createLogger('observer:retro');

// ── Interfaces ──────────────────────────────────────────────────

export interface RetroResponse {
  agent: string;
  model: string;
  howDidItGo: string;
  whatWorkedBest: string;
  whatWorkedWorst: string;
  specificQuestions: Array<{
    question: string;
    answer: string;
  }>;
  tokensUsed: {
    input: number;
    output: number;
    cost: number;
  };
}

export interface RunArtifacts {
  reportContent: string;
  knowledgeContent: string;
  briefContent: string;
  stoplight: string;
}

// ── Helper: extract brief title ──────────────────────────────────

function extractBriefTitle(briefContent: string): string {
  if (!briefContent) return '(okänd brief)';
  const lines = briefContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      // Strip markdown heading markers
      return trimmed.replace(/^#+\s*/, '').trim() || '(okänd brief)';
    }
  }
  return '(okänd brief)';
}

// ── buildRetroUserMessage ────────────────────────────────────────

/**
 * Build the user message for the retro conversation.
 * Includes run context and three standard questions.
 */
export function buildRetroUserMessage(
  agentRole: string,
  runArtifacts: RunArtifacts,
  toolSummary: string[],
): string {
  // Count occurrences of each tool name
  let toolSummaryStr: string;
  if (!toolSummary || toolSummary.length === 0) {
    toolSummaryStr = 'Inga tool-anrop registrerade';
  } else {
    const counts: Record<string, number> = {};
    for (const tool of toolSummary) {
      counts[tool] = (counts[tool] ?? 0) + 1;
    }
    toolSummaryStr = Object.entries(counts)
      .map(([tool, count]) => `${tool} (${count})`)
      .join(', ');
  }

  const briefTitle = extractBriefTitle(runArtifacts.briefContent);

  return [
    'Körningen är avslutad. Observer-agenten vill förstå hur det gick för dig.',
    '',
    'Svara ärligt och kortfattat. Det är helt OK att säga "allt gick bra" eller',
    '"inget att anmärka". Tvinga inte fram kritik eller beröm — ärlighet framför',
    'performativitet.',
    '',
    '## Körningens kontext',
    `- **Brief:** ${briefTitle}`,
    `- **Din roll:** ${agentRole}`,
    `- **Stoplight:** ${runArtifacts.stoplight}`,
    `- **Dina tool-anrop:** ${toolSummaryStr}`,
    '',
    '## Tre frågor',
    '',
    '1. Hur gick det tycker du?',
    '2. Vad funkade bäst i denna körning?',
    '3. Vad funkade sämst, om något?',
    '',
    'Svara under tre rubriker: "Hur gick det", "Bäst", "Sämst".',
  ].join('\n');
}

// ── buildFollowUpMessage ─────────────────────────────────────────

/**
 * Build a follow-up message if there are observations for this agent.
 * Returns null if no relevant observations exist.
 */
export function buildFollowUpMessage(
  observations: Observation[],
): string | null {
  if (!observations || observations.length === 0) {
    return null;
  }

  const lines = ['Tack. Observer noterade följande under körningen:', ''];
  for (const obs of observations) {
    lines.push(
      `${obs.promptClaim} — men under körningen: ${obs.actualBehavior}`,
    );
    lines.push('');
  }
  lines.push('Kan du förklara vad som hände?');

  return lines.join('\n').trim();
}

// ── parseRetroResponse ───────────────────────────────────────────

/**
 * Parse the retro response text into structured fields.
 * Looks for markdown headers to split the response.
 */
export function parseRetroResponse(text: string): {
  howDidItGo: string;
  whatWorkedBest: string;
  whatWorkedWorst: string;
} {
  if (!text || !text.trim()) {
    return { howDidItGo: '', whatWorkedBest: '', whatWorkedWorst: '' };
  }

  // Patterns to match headers (##, #, or **bold**)
  const headerPattern =
    /(?:^|\n)(?:#{1,3}\s*|\*\*)(Hur gick det|Bäst|Sämst)(?:\*\*)?\s*\n/gi;

  // Collect all header positions
  const sections: Array<{ key: string; start: number }> = [];
  let match: RegExpExecArray | null;

  // We need to reset lastIndex between uses
  const re = new RegExp(headerPattern.source, headerPattern.flags);
  while ((match = re.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    // The content starts after the full match
    sections.push({ key, start: match.index + match[0].length });
  }

  if (sections.length === 0) {
    // Fallback: no headers found — put entire text in howDidItGo
    return {
      howDidItGo: text.trim(),
      whatWorkedBest: '',
      whatWorkedWorst: '',
    };
  }

  // Extract text between a section start and the next section (or end)
  const extractSection = (idx: number): string => {
    const start = sections[idx].start;
    const end = idx + 1 < sections.length ? sections[idx + 1].start : text.length;
    let raw = text.slice(start, end);
    // Remove any trailing header that bled into this slice
    raw = raw.replace(/\n+(?:#{1,3}\s*|\*\*)?(?:Hur gick det|Bäst|Sämst)(?:\*\*)?\s*$/i, '');
    return raw.trim();
  };

  let howDidItGo = '';
  let whatWorkedBest = '';
  let whatWorkedWorst = '';

  for (let i = 0; i < sections.length; i++) {
    const key = sections[i].key;
    const content = extractSection(i);
    if (key === 'hur gick det') {
      howDidItGo = content;
    } else if (key === 'bäst') {
      whatWorkedBest = content;
    } else if (key === 'sämst') {
      whatWorkedWorst = content;
    }
  }

  return { howDidItGo, whatWorkedBest, whatWorkedWorst };
}

// ── runRetro ─────────────────────────────────────────────────────

/**
 * Run retro conversations with all agents that have prompts.
 * Sequentially calls each agent with retro questions and optional follow-up.
 *
 * @param observations - From ObserverAgent.analyzeRun()
 * @param runArtifacts - Run artifacts (report, knowledge, brief, stoplight)
 * @param agentPrompts - Map of role → full prompt text
 * @param agentToolSummaries - Map of role → list of tool calls during the run
 * @param agentModelMap - Optional per-agent model overrides
 * @param defaultModelOverride - Optional default model override
 */
export async function runRetro(
  observations: Observation[],
  runArtifacts: RunArtifacts,
  agentPrompts: Map<string, string>,
  agentToolSummaries: Map<string, string[]>,
  agentModelMap?: Record<string, unknown>,
  defaultModelOverride?: string,
): Promise<RetroResponse[]> {
  const config = resolveModelConfig(
    'observer',
    agentModelMap as AgentModelMap | undefined,
    defaultModelOverride,
  );
  const { client, model } = createAgentClient(config);

  const results: RetroResponse[] = [];

  for (const [agentRole, promptText] of agentPrompts) {
    logger.info('Running retro for agent', { agent: agentRole });

    try {
      const toolSummary = agentToolSummaries.get(agentRole) ?? [];
      const userMessage = buildRetroUserMessage(agentRole, runArtifacts, toolSummary);

      // Build message history for the conversation
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: userMessage },
      ];

      // First API call — initial retro questions
      const firstResponse = await (client.messages.create as (
        params: Anthropic.MessageCreateParamsNonStreaming & { signal?: AbortSignal },
      ) => Promise<Anthropic.Message>)({
        model,
        max_tokens: 2048,
        system: promptText,
        messages,
        signal: AbortSignal.timeout(30_000),
      });

      const firstText =
        (firstResponse.content.find(
          (b): b is Anthropic.TextBlock => b.type === 'text',
        )?.text) ?? '';

      let inputTokens = firstResponse.usage.input_tokens;
      let outputTokens = firstResponse.usage.output_tokens;

      // Check for observations specific to this agent
      const agentObservations = observations.filter((o) => o.agent === agentRole);
      const followUp = buildFollowUpMessage(agentObservations);

      let specificQuestions: Array<{ question: string; answer: string }> = [];

      if (followUp) {
        // Second API call — follow-up about observations
        messages.push({ role: 'assistant', content: firstText });
        messages.push({ role: 'user', content: followUp });

        const followUpResponse = await (client.messages.create as (
          params: Anthropic.MessageCreateParamsNonStreaming & { signal?: AbortSignal },
        ) => Promise<Anthropic.Message>)({
          model,
          max_tokens: 2048,
          system: promptText,
          messages,
          signal: AbortSignal.timeout(30_000),
        });

        const followUpText =
          (followUpResponse.content.find(
            (b): b is Anthropic.TextBlock => b.type === 'text',
          )?.text) ?? '';

        inputTokens += followUpResponse.usage.input_tokens;
        outputTokens += followUpResponse.usage.output_tokens;

        // Record follow-up as specific questions
        specificQuestions = agentObservations.map((obs, idx) => ({
          question: `${obs.promptClaim} — men under körningen: ${obs.actualBehavior}. Kan du förklara vad som hände?`,
          answer: idx === 0 ? followUpText : '',
        }));
      }

      const parsed = parseRetroResponse(firstText);
      const modelKey = getModelShortName(model);
      const cost = calcCost(inputTokens, outputTokens, modelKey);

      results.push({
        agent: agentRole,
        model,
        howDidItGo: parsed.howDidItGo,
        whatWorkedBest: parsed.whatWorkedBest,
        whatWorkedWorst: parsed.whatWorkedWorst,
        specificQuestions,
        tokensUsed: {
          input: inputTokens,
          output: outputTokens,
          cost,
        },
      });

      logger.info('Retro completed for agent', {
        agent: agentRole,
        inputTokens: String(inputTokens),
        outputTokens: String(outputTokens),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('Retro failed for agent', { agent: agentRole, error: errorMessage });

      results.push({
        agent: agentRole,
        model,
        howDidItGo: 'retro: failed',
        whatWorkedBest: '',
        whatWorkedWorst: errorMessage,
        specificQuestions: [],
        tokensUsed: {
          input: 0,
          output: 0,
          cost: 0,
        },
      });
    }
  }

  return results;
}
