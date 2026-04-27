import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import path from 'path';
import { createLogger } from '../../core/logger.js';
import { AURORA_MODELS } from '../../aurora/llm-defaults.js';
import { TOOL_CATALOG, type ToolEntry } from '../tool-catalog.js';

const logger = createLogger('mcp:neuron-help');

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface HelpResult {
  name: string;
  category: string;
  reason: string;
  exampleMcp?: string;
  exampleCli?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const HAIKU_TIMEOUT_MS = 15_000;
const HAIKU_MAX_TOKENS = 512;

const FALLBACK_PROMPT = [
  'Du är en hjälpassistent. Givet en fråga och en lista verktyg,',
  'returnera en JSON-array med de 3 mest relevanta: [{"name":"...","reason":"..."}].',
  'Svara ENBART med JSON.\n\nFråga: {{question}}\n\nVerktyg:\n{{tools}}',
].join(' ');

const DIACRITICS_MAP: Record<string, string> = {
  ö: 'o', ä: 'a', å: 'a',
  Ö: 'O', Ä: 'A', Å: 'A',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Tokenize a string into lowercase tokens, splitting on whitespace + punctuation. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s.,;:!?]+/)
    .filter(Boolean);
}

/** Strip Swedish diacritics from a string. */
function normalizeDiacritics(s: string): string {
  return s.replace(/[öäåÖÄÅ]/g, (ch) => DIACRITICS_MAP[ch] ?? ch);
}

/** Count how many unique keywords match at least one token. */
function scoreKeywords(tool: ToolEntry, tokens: string[], normalize: boolean): number {
  let count = 0;
  const prepared = normalize ? tokens.map(normalizeDiacritics) : tokens;
  for (const kw of tool.keywords) {
    const kwLower = kw.toLowerCase();
    const kwCompare = normalize ? normalizeDiacritics(kwLower) : kwLower;
    if (prepared.includes(kwCompare)) {
      count++;
    }
  }
  return count;
}

/** Build compact tool summary for Haiku prompt. */
function toolsToPromptJson(tools: ToolEntry[]): string {
  return JSON.stringify(
    tools.map((t) => ({ name: t.name, description: t.description, category: t.category })),
  );
}

/** Map a tool entry + reason to a HelpResult. */
function toHelpResult(tool: ToolEntry, reason: string): HelpResult {
  return {
    name: tool.name,
    category: tool.category,
    reason,
    ...(tool.exampleMcp ? { exampleMcp: tool.exampleMcp } : {}),
    ...(tool.exampleCli ? { exampleCli: tool.exampleCli } : {}),
  };
}

/* ------------------------------------------------------------------ */
/*  Prompt loading                                                     */
/* ------------------------------------------------------------------ */

let _cachedPrompt: string | undefined;

async function loadPromptTemplate(): Promise<string> {
  if (_cachedPrompt) return _cachedPrompt;
  try {
    const promptPath = path.resolve(process.cwd(), 'prompts', 'neuron-help.md');
    _cachedPrompt = await readFile(promptPath, 'utf-8');
    return _cachedPrompt;
  } catch (err) {
    logger.warn('Failed to load prompts/neuron-help.md, using fallback', { error: String(err) });
    return FALLBACK_PROMPT;
  }
}

/* ------------------------------------------------------------------ */
/*  Haiku call                                                         */
/* ------------------------------------------------------------------ */

const HaikuResponseSchema = z.array(z.object({ name: z.string(), reason: z.string() }));

async function callHaiku(question: string, tools: ToolEntry[]): Promise<Array<{ name: string; reason: string }>> {
  const template = await loadPromptTemplate();
  const prompt = template
    .replace('{{question}}', question)
    .replace('{{tools}}', toolsToPromptJson(tools));

  const client = new Anthropic();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: AURORA_MODELS.fast,
        max_tokens: HAIKU_MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: controller.signal },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const parsed = JSON.parse(textBlock.text);
    const validated = HaikuResponseSchema.parse(parsed);

    // Filter out hallucinated tool names
    const catalogNames = new Set(TOOL_CATALOG.map((t) => t.name));
    return validated.filter((r) => catalogNames.has(r.name));
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/*  Public: findTools                                                   */
/* ------------------------------------------------------------------ */

export async function findTools(question: string): Promise<HelpResult[]> {
  const trimmed = question.trim();
  if (!trimmed) {
    return [{ name: '', category: '', reason: 'Hittade inget matchande verktyg. Prova att omformulera din fråga.' }];
  }

  const tokens = tokenize(trimmed);

  // Step 1: keyword matching — first pass (diacritics intact)
  let scored = TOOL_CATALOG
    .map((tool) => ({ tool, score: scoreKeywords(tool, tokens, false) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);

  // If 0 matches, second pass with normalized diacritics
  if (scored.length === 0) {
    scored = TOOL_CATALOG
      .map((tool) => ({ tool, score: scoreKeywords(tool, tokens, true) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  const keywordResults = scored.map((e) => e.tool);

  // Step 2: routing
  try {
    if (keywordResults.length > 3) {
      // >3 matches: Haiku picks top 3 from top 10
      const top10 = keywordResults.slice(0, 10);
      const haikuResults = await callHaiku(trimmed, top10);
      const results = fillFromKeywords(haikuResults, keywordResults, 3);
      return results;
    } else if (keywordResults.length >= 1) {
      // 1-3 matches: return directly
      return keywordResults.map((t) => toHelpResult(t, t.description));
    } else {
      // 0 matches: Haiku with ALL tools
      const haikuResults = await callHaiku(trimmed, TOOL_CATALOG);
      if (haikuResults.length === 0) {
        return [{ name: '', category: '', reason: 'Hittade inget matchande verktyg. Prova att omformulera din fråga.' }];
      }
      return fillFromKeywords(haikuResults, [], 3);
    }
  } catch (err) {
    logger.warn('Haiku call failed, falling back to keyword results', { error: String(err) });
    if (keywordResults.length > 0) {
      return keywordResults.slice(0, 3).map((t) => toHelpResult(t, t.description));
    }
    return [{ name: '', category: '', reason: 'Hittade inget matchande verktyg. Prova att omformulera din fråga.' }];
  }
}

/** Fill Haiku results up to `max` from keyword fallback. */
function fillFromKeywords(
  haikuResults: Array<{ name: string; reason: string }>,
  keywordFallback: ToolEntry[],
  max: number,
): HelpResult[] {
  const results: HelpResult[] = [];
  const seen = new Set<string>();

  for (const hr of haikuResults) {
    if (results.length >= max) break;
    const tool = TOOL_CATALOG.find((t) => t.name === hr.name);
    if (tool && !seen.has(tool.name)) {
      results.push(toHelpResult(tool, hr.reason));
      seen.add(tool.name);
    }
  }

  // Fill remaining from keyword results
  for (const tool of keywordFallback) {
    if (results.length >= max) break;
    if (!seen.has(tool.name)) {
      results.push(toHelpResult(tool, tool.description));
      seen.add(tool.name);
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Public: listAllToolsByCategory                                     */
/* ------------------------------------------------------------------ */

export function listAllToolsByCategory(): string {
  const byCategory = new Map<string, ToolEntry[]>();
  for (const tool of TOOL_CATALOG) {
    const existing = byCategory.get(tool.category) ?? [];
    existing.push(tool);
    byCategory.set(tool.category, existing);
  }

  const lines: string[] = [];
  for (const [category, tools] of byCategory) {
    lines.push(`\n## ${category}`);
    for (const t of tools) {
      lines.push(`  ${t.name} — ${t.description}`);
    }
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  MCP registration                                                   */
/* ------------------------------------------------------------------ */

export function registerNeuronHelpTool(server: McpServer): void {
  server.tool(
    'neuron_help',
    'Hitta rätt Neuron-verktyg — beskriv vad du vill göra så får du förslag med exempelanrop',
    { question: z.string().describe('Beskriv vad du vill göra, t.ex. "indexera en video"') },
    async ({ question }) => {
      try {
        const results = await findTools(question);
        const text = results
          .map((r, i) => {
            const lines = [`${i + 1}. **${r.name}** [${r.category}]`, `   ${r.reason}`];
            if (r.exampleMcp) lines.push(`   MCP: ${r.exampleMcp}`);
            if (r.exampleCli) lines.push(`   CLI: ${r.exampleCli}`);
            return lines.join('\n');
          })
          .join('\n\n');

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        logger.error('neuron_help error', { error: String(err) });
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}
