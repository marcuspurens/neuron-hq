/**
 * Run-narrative module: generates run-narrative.md with AI (Haiku) + fallback.
 * Pure functions where possible; async generateRunNarrative for orchestration.
 */

import fs from 'fs/promises';
import path from 'path';
import type { NarrativeEntry } from './narrative-collector.js';
import type { Decision } from './decision-extractor.js';
import { narrateDecisionSimple } from './narrative.js';
import { resolveModelConfig } from './model-registry.js';
import { createAgentClient } from './agent-client.js';
import { createLogger } from './logger.js';

const logger = createLogger('run-narrative');

// ── Types ────────────────────────────────────────────────

export interface NarrativeData {
  runId: string;
  briefTitle: string;
  stoplight: string;
  agents: string[];
  entries: NarrativeEntry[];
  decisions: Decision[];
}

// ── Pure Functions ───────────────────────────────────────

/**
 * Trim entries to fit within max count and max character budget.
 *
 * Priority order with deduplication:
 *   a. All decision entries (highest priority)
 *   b. First 10 non-decision entries (startup)
 *   c. Last 10 non-decision entries (conclusion)
 *   d. Remaining slots: warnings > actions with detail
 *   e. Deduplicate
 *   f. Truncate to max if still exceeding
 *   g. If JSON size > maxChars, remove from middle until under limit
 */
export function trimEntries(
  entries: NarrativeEntry[],
  max: number = 50,
  maxChars: number = 30000,
): NarrativeEntry[] {
  if (entries.length === 0) return [];

  // Use a Set to track indices we've already selected (for dedup)
  const selectedIndices = new Set<number>();

  // a. All decision entries
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type === 'decision') {
      selectedIndices.add(i);
    }
  }

  // b. First 10 non-decision entries (startup)
  const nonDecisionIndices = entries
    .map((e, i) => ({ entry: e, index: i }))
    .filter((x) => x.entry.type !== 'decision');

  for (const item of nonDecisionIndices.slice(0, 10)) {
    selectedIndices.add(item.index);
  }

  // c. Last 10 non-decision entries (conclusion)
  for (const item of nonDecisionIndices.slice(-10)) {
    selectedIndices.add(item.index);
  }

  // d. Remaining slots: warnings > actions with detail
  if (selectedIndices.size < max) {
    const remaining = nonDecisionIndices.filter(
      (x) => !selectedIndices.has(x.index),
    );

    // Warnings first
    const warnings = remaining.filter((x) => x.entry.type === 'warning');
    for (const w of warnings) {
      if (selectedIndices.size >= max) break;
      selectedIndices.add(w.index);
    }

    // Then actions with detail
    const actionsWithDetail = remaining.filter(
      (x) => x.entry.type === 'action' && x.entry.detail,
    );
    for (const a of actionsWithDetail) {
      if (selectedIndices.size >= max) break;
      selectedIndices.add(a.index);
    }
  }

  // e. Deduplicate is implicit — we used a Set of indices

  // f. Truncate to max
  const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
  const truncatedIndices = sortedIndices.slice(0, max);
  const result = truncatedIndices.map((i) => entries[i]);

  // g. Total JSON size check
  while (result.length > 1 && JSON.stringify(result).length > maxChars) {
    // Remove from the middle
    const midIndex = Math.floor(result.length / 2);
    result.splice(midIndex, 1);
  }

  return result;
}

/**
 * Build YAML frontmatter for the narrative markdown.
 */
function buildFrontmatter(data: NarrativeData): string {
  const lines = [
    '---',
    `generated: ${new Date().toISOString()}`,
    `run_id: ${data.runId}`,
    `stoplight: ${data.stoplight}`,
    `agents: [${data.agents.join(', ')}]`,
    '---',
  ];
  return lines.join('\n');
}

/**
 * Render a rule-based (no AI) fallback narrative in markdown.
 */
export function renderFallbackNarrative(data: NarrativeData): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push(buildFrontmatter(data));
  lines.push('');

  // Title
  lines.push(`# Körningsberättelse: ${data.briefTitle}`);
  lines.push('');

  // Minimal narrative if no entries and no decisions
  if (data.entries.length === 0 && data.decisions.length === 0) {
    lines.push('## Sammanfattning');
    lines.push('');
    lines.push('Körningen avbröts innan agenter hann agera.');
    lines.push('');
    return lines.join('\n');
  }

  // Sammanfattning
  lines.push('## Sammanfattning');
  lines.push('');
  lines.push(`Körning ${data.runId} avslutades med stoplight: ${data.stoplight}.`);
  lines.push('');

  // Vad hände — per agent
  lines.push('## Vad hände');
  lines.push('');

  const entriesByAgent = new Map<string, NarrativeEntry[]>();
  for (const entry of data.entries) {
    const agent = entry.agent || 'unknown';
    if (!entriesByAgent.has(agent)) entriesByAgent.set(agent, []);
    entriesByAgent.get(agent)!.push(entry);
  }

  if (entriesByAgent.size === 0) {
    lines.push('Inga händelser registrerade.');
    lines.push('');
  } else {
    for (const [agent, agentEntries] of entriesByAgent) {
      const capitalized = agent.charAt(0).toUpperCase() + agent.slice(1);
      lines.push(`### ${capitalized}`);
      lines.push('');
      for (const entry of agentEntries) {
        lines.push(`- ${entry.summary}`);
      }
      lines.push('');
    }
  }

  // Nyckelbeslut
  lines.push('## Nyckelbeslut');
  lines.push('');

  if (data.decisions.length === 0) {
    lines.push('Inga explicita beslut loggade.');
  } else {
    for (const decision of data.decisions) {
      lines.push(`- ${narrateDecisionSimple(decision)}`);
    }
  }
  lines.push('');

  // Slutsats
  lines.push('## Slutsats');
  lines.push('');
  lines.push(`Körning ${data.runId} avslutad. Status: ${data.stoplight}.`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Render narrative markdown: frontmatter + body.
 * If aiBody is provided, use it as the body. Otherwise use fallback logic.
 */
export function renderNarrativeMarkdown(
  data: NarrativeData,
  aiBody?: string,
): string {
  if (aiBody) {
    return buildFrontmatter(data) + '\n\n' + aiBody + '\n';
  }
  return renderFallbackNarrative(data);
}

// ── Async Orchestrator ───────────────────────────────────

/**
 * Main orchestrator: generates run-narrative.md for a run.
 * Returns the file path on success, or null if narrative already exists.
 */
export async function generateRunNarrative(options: {
  runDir: string;
  runId: string;
  entries: NarrativeEntry[];
  decisions: Decision[];
  baseDir: string;
  agentModelMap?: Parameters<typeof resolveModelConfig>[1];
  defaultModelOverride?: string;
}): Promise<string | null> {
  const { runDir, runId, entries, decisions, baseDir } = options;
  const outPath = path.join(runDir, 'run-narrative.md');

  // Step 1: Don't overwrite existing narrative
  try {
    await fs.access(outPath);
    logger.info('run-narrative.md already exists, skipping', { runDir });
    return null;
  } catch {
    // File doesn't exist — continue
  }

  // Step 2: Read brief.md for title, report.md for stoplight
  const briefTitle = await readBriefTitle(runDir, runId);
  const stoplight = await readStoplight(runDir);

  // Step 3: Build NarrativeData
  const agents = [...new Set(entries.map((e) => e.agent).filter(Boolean))];
  const data: NarrativeData = {
    runId,
    briefTitle,
    stoplight,
    agents,
    entries,
    decisions,
  };

  // Step 4: Minimal narrative if 0 entries AND 0 decisions
  if (entries.length === 0 && decisions.length === 0) {
    const content = renderFallbackNarrative(data);
    await fs.writeFile(outPath, content, 'utf-8');
    logger.info('Wrote minimal run-narrative.md (no entries/decisions)', { runDir });
    return outPath;
  }

  // Step 5: Trim entries
  const trimmed = trimEntries(entries);
  const trimmedData: NarrativeData = { ...data, entries: trimmed };

  // Step 6-9: Try AI generation, fallback to rule-based
  let markdown: string;
  try {
    const aiBody = await callHaiku(trimmedData, baseDir, options.agentModelMap, options.defaultModelOverride);
    if (aiBody) {
      // Check word count
      const wordCount = aiBody.split(/\s+/).length;
      if (wordCount > 600) {
        logger.warn('Narrativ överskred ordgräns', { wordCount });
      }
      markdown = renderNarrativeMarkdown(trimmedData, aiBody);
    } else {
      markdown = renderFallbackNarrative(trimmedData);
    }
  } catch (err) {
    logger.warn('Haiku call failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    markdown = renderFallbackNarrative(trimmedData);
  }

  // Step 10: Write file
  await fs.writeFile(outPath, markdown, 'utf-8');
  logger.info('Wrote run-narrative.md', { runDir });
  return outPath;
}

// ── Internal Helpers ─────────────────────────────────────

/**
 * Read the first line of brief.md for the title.
 */
async function readBriefTitle(runDir: string, fallback: string): Promise<string> {
  try {
    const content = await fs.readFile(path.join(runDir, 'brief.md'), 'utf-8');
    const firstLine = content.trim().split('\n')[0]?.trim();
    if (firstLine) {
      // Strip markdown heading prefix
      return firstLine.replace(/^#+\s*/, '').trim() || fallback;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Extract stoplight from report.md using regex.
 */
async function readStoplight(runDir: string): Promise<string> {
  try {
    const content = await fs.readFile(path.join(runDir, 'report.md'), 'utf-8');
    // Check first few lines for GREEN/YELLOW/RED
    const firstLines = content.split('\n').slice(0, 10).join('\n');
    const match = firstLines.match(/\b(GREEN|YELLOW|RED)\b/);
    return match ? match[1] : 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

/**
 * Read the narrative generation prompt from prompts/historian.md.
 * Extracts the section after "## Narrative Generation Prompt".
 */
async function readNarrativePrompt(baseDir: string): Promise<string | null> {
  try {
    const content = await fs.readFile(
      path.join(baseDir, 'prompts', 'historian.md'),
      'utf-8',
    );
    const marker = '## Narrative Generation Prompt';
    const idx = content.indexOf(marker);
    if (idx === -1) return null;
    // Extract everything after the marker heading
    const afterMarker = content.slice(idx + marker.length).trim();
    // Take until the next ## heading or end of file
    const nextHeading = afterMarker.indexOf('\n## ');
    if (nextHeading !== -1) {
      return afterMarker.slice(0, nextHeading).trim();
    }
    return afterMarker;
  } catch {
    return null;
  }
}

/**
 * Call Haiku to generate the narrative body.
 * Returns the AI-generated text, or null on failure.
 */
async function callHaiku(
  data: NarrativeData,
  baseDir: string,
  agentModelMap?: Parameters<typeof resolveModelConfig>[1],
  defaultModelOverride?: string,
): Promise<string | null> {
  // Load prompt
  const promptText = await readNarrativePrompt(baseDir);
  if (!promptText) {
    logger.info('No narrative prompt found in historian.md, using fallback');
    return null;
  }

  // Build user message
  const userMessage = [
    `Titel: ${data.briefTitle}`,
    `Stoplight: ${data.stoplight}`,
    '',
    'Händelser (JSON):',
    JSON.stringify(data.entries, null, 2),
    '',
    'Beslut (JSON):',
    JSON.stringify(data.decisions, null, 2),
  ].join('\n');

  // Resolve model and create client
  const config = resolveModelConfig('historian', agentModelMap, defaultModelOverride);
  const { client, model } = createAgentClient(config);

  // Call with 60s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 2048,
        system: promptText,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal },
    );

    // Extract text from response
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : null;
  } finally {
    clearTimeout(timeout);
  }
}
