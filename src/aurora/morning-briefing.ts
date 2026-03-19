import { getPool } from '../core/db.js';
import { getFreshnessReport } from './freshness.js';
import { resolveModelConfig } from '../core/model-registry.js';
import { createAgentClient } from '../core/agent-client.js';
import { createLogger } from '../core/logger.js';
import type Anthropic from '@anthropic-ai/sdk';
import { readdir, readFile, mkdir, writeFile, access } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('aurora:morning-briefing');

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface MorningBriefingOptions {
  date?: string;       // YYYY-MM-DD, defaults to today
  force?: boolean;     // overwrite existing file
  vaultPath?: string;  // Obsidian vault path
}

export interface NodeCount {
  type: string;
  count: number;
}

export interface RunInfo {
  dirName: string;   // e.g. '20260319-1327-neuron-hq'
  title: string;     // from brief.md line 1
  status: 'green' | 'red' | 'unknown';
}

export interface IdeaInfo {
  title: string;
  confidence: number;
  nodeId: string;
}

export interface StaleSource {
  title: string;
  nodeId: string;
  daysSinceVerified: number;
}

export interface KnowledgeGap {
  title: string;
  content: string;
  nodeId: string;
}

export interface BriefingQuestion {
  question: string;
  source_node_id: string;
  category: 'gap' | 'stale' | 'idea';
}

export interface BriefingData {
  date: string;          // YYYY-MM-DD
  periodStart: Date;
  periodEnd: Date;
  newNodes: NodeCount[];
  runs: RunInfo[];
  newIdeas: IdeaInfo[];
  staleSources: StaleSource[];
  agingCount: number;
  knowledgeGaps: KnowledgeGap[];
  questions: BriefingQuestion[];
}

export interface MorningBriefingResult {
  markdown: string;
  filePath: string;
  data: BriefingData;
}

// ─── Data Collection ──────────────────────────────────────────────────────────

/** Gather all briefing data from DB and filesystem without AI. */
export async function collectBriefingData(
  periodStart: Date,
  periodEnd: Date,
): Promise<Omit<BriefingData, 'questions'>> {
  const dateStr = periodEnd.toISOString().slice(0, 10);

  const [newNodes, runs, newIdeas, staleSources, agingCount, knowledgeGaps] =
    await Promise.all([
      queryNewNodes(periodStart),
      scanRecentRuns(periodStart),
      queryNewIdeas(periodStart),
      queryStaleSourcesWrapped(),
      queryAgingCount(),
      queryKnowledgeGaps(),
    ]);

  return {
    date: dateStr,
    periodStart,
    periodEnd,
    newNodes,
    runs,
    newIdeas,
    staleSources,
    agingCount,
    knowledgeGaps,
  };
}

async function queryNewNodes(periodStart: Date): Promise<NodeCount[]> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT type, COUNT(*)::int as count FROM aurora_nodes WHERE created > $1 GROUP BY type ORDER BY count DESC`,
      [periodStart],
    );
    return rows.map((r: Record<string, unknown>) => ({
      type: r.type as string,
      count: r.count as number,
    }));
  } catch (err) {
    logger.error('Failed to query new nodes', { error: String(err) });
    return [];
  }
}

async function scanRecentRuns(periodStart: Date): Promise<RunInfo[]> {
  try {
    const runsDir = path.resolve(__dirname, '../../runs');
    const entries = await readdir(runsDir);
    const runPattern = /^(\d{8})-(\d{4})-(.+)$/;
    const results: RunInfo[] = [];

    const periodStartDate = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      periodStart.getDate(),
    );

    for (const entry of entries) {
      const match = entry.match(runPattern);
      if (!match) continue;

      const dateStr = match[1];
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10) - 1;
      const day = parseInt(dateStr.slice(6, 8), 10);
      const dirDate = new Date(year, month, day);

      if (dirDate < periodStartDate) continue;

      let status: 'green' | 'red' | 'unknown' = 'unknown';
      try {
        const reportContent = await readFile(
          path.join(runsDir, entry, 'report.md'),
          'utf-8',
        );
        const lines = reportContent.split('\n');
        if (lines.length >= 3) {
          const line3 = lines[2];
          if (line3.includes('✅')) status = 'green';
          else if (line3.includes('❌')) status = 'red';
        }
      } catch {
        // report.md may not exist
      }

      let title = entry;
      try {
        const briefContent = await readFile(
          path.join(runsDir, entry, 'brief.md'),
          'utf-8',
        );
        const firstLine = briefContent.split('\n')[0];
        if (firstLine.startsWith('#')) {
          title = firstLine.replace(/^#+\s*/, '');
        }
      } catch {
        // brief.md may not exist
      }

      results.push({ dirName: entry, title, status });
    }

    return results;
  } catch (err) {
    logger.error('Failed to scan runs directory', { error: String(err) });
    return [];
  }
}

async function queryNewIdeas(periodStart: Date): Promise<IdeaInfo[]> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, title, confidence FROM aurora_nodes WHERE type = 'concept' AND created > $1 ORDER BY confidence DESC LIMIT 10`,
      [periodStart],
    );
    return rows.map((r: Record<string, unknown>) => ({
      title: r.title as string,
      confidence: r.confidence as number,
      nodeId: r.id as string,
    }));
  } catch (err) {
    logger.error('Failed to query new ideas', { error: String(err) });
    return [];
  }
}

async function queryStaleSourcesWrapped(): Promise<StaleSource[]> {
  try {
    const report = await getFreshnessReport({ onlyStale: true, limit: 5 });
    return report.map((r) => ({
      title: r.title,
      nodeId: r.nodeId,
      daysSinceVerified: r.daysSinceVerified ?? 0,
    }));
  } catch (err) {
    logger.error('Failed to query stale sources', { error: String(err) });
    return [];
  }
}

async function queryAgingCount(): Promise<number> {
  try {
    const report = await getFreshnessReport({ limit: 50 });
    return report.filter((r) => r.status === 'aging').length;
  } catch (err) {
    logger.error('Failed to query aging count', { error: String(err) });
    return 0;
  }
}

async function queryKnowledgeGaps(): Promise<KnowledgeGap[]> {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, title, content FROM aurora_nodes WHERE type = 'research' AND properties->>'gapType' = 'unanswered' ORDER BY created DESC LIMIT 3`,
    );
    return rows.map((r: Record<string, unknown>) => ({
      title: r.title as string,
      content: (r.content as string) ?? '',
      nodeId: r.id as string,
    }));
  } catch (err) {
    logger.error('Failed to query knowledge gaps', { error: String(err) });
    return [];
  }
}

// ─── Question Generation ──────────────────────────────────────────────────────

interface QuestionCandidate {
  title: string;
  nodeId: string;
  category: 'gap' | 'stale' | 'idea';
  daysSinceVerified?: number;
  confidence?: number;
}

/** Generate 3 briefing questions — tries AI first, falls back to rule-based. */
export async function generateQuestions(
  data: Omit<BriefingData, 'questions'>,
): Promise<BriefingQuestion[]> {
  const candidates = collectCandidates(data);
  if (candidates.length === 0) return [];

  try {
    return await generateQuestionsWithAI(candidates);
  } catch (err) {
    logger.warn('AI question generation failed, using fallback', {
      error: String(err),
    });
    return generateQuestionsFallback(candidates);
  }
}

function collectCandidates(
  data: Omit<BriefingData, 'questions'>,
): QuestionCandidate[] {
  const candidates: QuestionCandidate[] = [];

  for (const gap of data.knowledgeGaps.slice(0, 2)) {
    candidates.push({
      title: gap.title,
      nodeId: gap.nodeId,
      category: 'gap',
    });
  }

  for (const stale of data.staleSources.slice(0, 2)) {
    candidates.push({
      title: stale.title,
      nodeId: stale.nodeId,
      category: 'stale',
      daysSinceVerified: stale.daysSinceVerified,
    });
  }

  for (const idea of data.newIdeas.slice(0, 2)) {
    candidates.push({
      title: idea.title,
      nodeId: idea.nodeId,
      category: 'idea',
      confidence: idea.confidence,
    });
  }

  return candidates.slice(0, 6);
}

async function generateQuestionsWithAI(
  candidates: QuestionCandidate[],
): Promise<BriefingQuestion[]> {
  const config = resolveModelConfig('brief-agent');
  const { client, model } = createAgentClient(config);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Du är Aurora, ett kunskapssystem. Baserat på följande data, formulera exakt 3 frågor
till Marcus (ägaren) på svenska. Varje fråga ska:
- Vara konkret och besvarbar med ett kort svar
- Referera till specifik data (namn, titel, datum)
- Sluta med en rekommendation

Data:
${JSON.stringify(candidates)}

Svara som JSON-array: [{"question": "...", "source_node_id": "...", "category": "gap|stale|idea"}]`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const text = response.content
      .filter(
        (block): block is Anthropic.TextBlock =>
          block.type === 'text',
      )
      .map((block) => block.text)
      .join('');

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in AI response');
    }

    const parsed: unknown[] = JSON.parse(jsonMatch[0]);
    const questions: BriefingQuestion[] = [];

    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'question' in item &&
        'source_node_id' in item &&
        'category' in item
      ) {
        const q = item as Record<string, unknown>;
        const cat = q.category as string;
        if (cat === 'gap' || cat === 'stale' || cat === 'idea') {
          questions.push({
            question: q.question as string,
            source_node_id: q.source_node_id as string,
            category: cat,
          });
        }
      }
    }

    if (questions.length === 0) {
      throw new Error('No valid questions parsed from AI response');
    }

    return questions.slice(0, 3);
  } finally {
    clearTimeout(timeout);
  }
}

function generateQuestionsFallback(
  candidates: QuestionCandidate[],
): BriefingQuestion[] {
  const questions: BriefingQuestion[] = [];

  for (const c of candidates.slice(0, 3)) {
    let question: string;
    if (c.category === 'gap') {
      question = `Kunskapslucka: ${c.title}. Ska vi forska på detta?`;
    } else if (c.category === 'stale') {
      question = `${c.title} verifierades senast för ${c.daysSinceVerified ?? 0} dagar sedan. Fortfarande relevant?`;
    } else {
      question = `Ny idé: ${c.title} (confidence ${c.confidence ?? 0}). Prioritera?`;
    }

    questions.push({
      question,
      source_node_id: c.nodeId,
      category: c.category,
    });
  }

  return questions;
}

// ─── Markdown Rendering ───────────────────────────────────────────────────────

/** Pure function: render BriefingData as markdown. */
export function renderBriefingMarkdown(data: BriefingData): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`id: briefing-${data.date}`);
  lines.push('type: morning-briefing');
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push(`period_start: ${data.periodStart.toISOString()}`);
  lines.push(`period_end: ${data.periodEnd.toISOString()}`);
  lines.push('---');
  lines.push('');
  lines.push(`# Morgon-briefing ${data.date}`);
  lines.push('');
  lines.push('## Vad har hänt sedan igår');
  lines.push('');

  // New nodes
  lines.push('### Nya noder');
  if (data.newNodes.length === 0) {
    lines.push('Inga nya noder senaste 24 timmarna.');
  } else {
    lines.push('');
    lines.push('| Typ | Antal |');
    lines.push('|-----|-------|');
    for (const n of data.newNodes) {
      lines.push(`| ${n.type} | ${n.count} |`);
    }
  }
  lines.push('');

  // Runs
  lines.push('### Körningar');
  if (data.runs.length === 0) {
    lines.push('Inga körningar senaste 24 timmarna.');
  } else {
    for (const r of data.runs) {
      const icon =
        r.status === 'green' ? '✅' : r.status === 'red' ? '❌' : '❓';
      lines.push(`- ${icon} **${r.title}** (\`${r.dirName}\`)`);
    }
  }
  lines.push('');

  // New ideas
  lines.push('### Nya idéer');
  if (data.newIdeas.length === 0) {
    lines.push('Inga nya idéer.');
  } else {
    for (const idea of data.newIdeas) {
      lines.push(
        `- **${idea.title}** — confidence ${idea.confidence} (\`${idea.nodeId}\`)`,
      );
    }
  }
  lines.push('');

  // Knowledge health
  lines.push('## Kunskapshälsa');
  lines.push('');

  // Stale sources
  lines.push('### Inaktuella källor');
  if (data.staleSources.length > 0) {
    for (const s of data.staleSources) {
      lines.push(
        `- **${s.title}** — ${s.daysSinceVerified} dagar sedan verifiering (\`${s.nodeId}\`)`,
      );
    }
  }
  lines.push('');
  lines.push(
    `${data.agingCount} noder närmar sig inaktualitet (status: aging).`,
  );
  lines.push('');

  // Knowledge gaps
  lines.push('### Kunskapsluckor');
  if (data.knowledgeGaps.length > 0) {
    for (const g of data.knowledgeGaps) {
      lines.push(`- **${g.title}** (\`${g.nodeId}\`)`);
    }
  }
  lines.push('');

  // Questions
  lines.push('## Frågor till dig');
  lines.push('');
  data.questions.forEach((q, i) => {
    lines.push(`### Fråga ${i + 1}: ${q.question}`);
    lines.push(`<!-- question_node_id: ${q.source_node_id} -->`);
    lines.push(`<!-- question_category: ${q.category} -->`);
    lines.push('<!-- svar: -->');
    lines.push('');
  });

  lines.push('---');
  lines.push('*Genererad av Aurora · [[Morgon-briefing]]*');

  return lines.join('\n');
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/** Generate a complete morning briefing: collect data, generate questions, render, write. */
export async function generateMorningBriefing(
  options: MorningBriefingOptions = {},
): Promise<MorningBriefingResult> {
  const dateStr = options.date ?? new Date().toISOString().slice(0, 10);

  // Parse date parts to build local Date objects
  const [year, month, day] = dateStr.split('-').map(Number);
  const periodEnd = new Date(year, month - 1, day);
  periodEnd.setHours(
    new Date().getHours(),
    new Date().getMinutes(),
    new Date().getSeconds(),
  );
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

  const vaultPath =
    options.vaultPath ??
    process.env.AURORA_OBSIDIAN_VAULT ??
    '/Users/mpmac/Documents/Neuron Lab';

  const briefingsDir = path.join(vaultPath, 'Briefings');
  const filePath = path.join(briefingsDir, `briefing-${dateStr}.md`);

  await mkdir(briefingsDir, { recursive: true });

  // If file already exists and force is not set, return existing
  if (!options.force) {
    try {
      await access(filePath);
      const existingMarkdown = await readFile(filePath, 'utf-8');
      logger.info('Briefing redan genererad för idag', { date: dateStr });
      return {
        markdown: existingMarkdown,
        filePath,
        data: {
          date: dateStr,
          periodStart,
          periodEnd,
          newNodes: [],
          runs: [],
          newIdeas: [],
          staleSources: [],
          agingCount: 0,
          knowledgeGaps: [],
          questions: [],
        },
      };
    } catch {
      // File doesn't exist, proceed
    }
  }

  logger.info('Generating morning briefing', { date: dateStr });

  const partialData = await collectBriefingData(periodStart, periodEnd);
  const questions = await generateQuestions(partialData);

  const data: BriefingData = {
    ...partialData,
    questions,
  };

  const markdown = renderBriefingMarkdown(data);
  await writeFile(filePath, markdown, 'utf-8');

  logger.info('Morning briefing written', { filePath });

  return { markdown, filePath, data };
}
