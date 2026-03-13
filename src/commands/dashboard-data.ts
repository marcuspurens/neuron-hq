import { getPool, isDbAvailable } from '../core/db.js';
import { getBeliefs, getBeliefHistory, getSummary } from '../core/run-statistics.js';
import { calcCost, getModelShortName, getModelLabel } from '../core/pricing.js';
import type { RunBelief, RunBeliefAudit } from '../core/run-statistics.js';

// Re-export types needed by template
export type { RunBelief, RunBeliefAudit };

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** RunSummary is not exported from run-statistics.ts, define locally. */
export interface RunSummary {
  strongest: RunBelief[];
  weakest: RunBelief[];
  trending_up: RunBelief[];
  trending_down: RunBelief[];
}

export interface DashboardData {
  // V1
  beliefs: RunBelief[];
  summary: RunSummary;
  historyMap: Record<string, RunBeliefAudit[]>;
  // V2
  runOverview: RunOverview;
  tokenUsage: TokenUsage;
  modelBreakdown: ModelBreakdown[];
  knowledgeStats: KnowledgeStats;
}

export interface RunOverview {
  totalRuns: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  unknownCount: number;
  recentRuns: RecentRun[];
}

export interface RecentRun {
  runid: string;
  target: string;
  status: string;
  model: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byAgent: Record<string, { input: number; output: number; cost: number }>;
  recentTokenTrend: Array<{ runid: string; tokens: number; cost: number }>;
}

export interface ModelBreakdown {
  model: string;
  label: string;
  runs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgCostPerRun: number;
}

export interface KnowledgeStats {
  neuronNodes: number;
  auroraNodes: number;
  neuronEdges: number;
  auroraEdges: number;
}

// ---------------------------------------------------------------------------
// Empty defaults
// ---------------------------------------------------------------------------

const emptyRunOverview: RunOverview = {
  totalRuns: 0, greenCount: 0, yellowCount: 0, redCount: 0,
  unknownCount: 0, recentRuns: [],
};

const emptyTokenUsage: TokenUsage = {
  totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0,
  byAgent: {}, recentTokenTrend: [],
};

const emptyKnowledgeStats: KnowledgeStats = {
  neuronNodes: 0, auroraNodes: 0, neuronEdges: 0, auroraEdges: 0,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ByAgentEntry {
  input_tokens?: number;
  output_tokens?: number;
}

/** Collect run overview from the runs + usage tables. */
async function collectRunOverview(): Promise<RunOverview> {
  const pool = getPool();

  // Status counts
  const { rows: statusRows } = await pool.query(
    'SELECT status, COUNT(*)::int as count FROM runs GROUP BY status',
  );

  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  let unknownCount = 0;

  for (const row of statusRows) {
    const status = (row.status as string | null)?.toUpperCase();
    const count = row.count as number;
    if (status === 'GREEN') greenCount = count;
    else if (status === 'YELLOW') yellowCount = count;
    else if (status === 'RED') redCount = count;
    else unknownCount += count;
  }

  const totalRuns = greenCount + yellowCount + redCount + unknownCount;

  // Recent runs
  const { rows: recentRows } = await pool.query(
    `SELECT r.runid, r.target_name, r.status, r.started_at,
            u.model, u.total_input_tokens, u.total_output_tokens
     FROM runs r LEFT JOIN usage u ON r.runid = u.runid
     ORDER BY r.started_at DESC LIMIT 20`,
  );

  const recentRuns: RecentRun[] = recentRows.map((r: Record<string, unknown>) => {
    const inputTokens = (r.total_input_tokens as number | null) ?? 0;
    const outputTokens = (r.total_output_tokens as number | null) ?? 0;
    const model = (r.model as string | null) ?? '';
    const shortModel = model ? getModelShortName(model) : 'sonnet';
    return {
      runid: r.runid as string,
      target: (r.target_name as string | null) ?? '',
      status: (r.status as string | null) ?? 'UNKNOWN',
      model,
      date: r.started_at ? String(r.started_at) : '',
      inputTokens,
      outputTokens,
      costUsd: calcCost(inputTokens, outputTokens, shortModel),
    };
  });

  return { totalRuns, greenCount, yellowCount, redCount, unknownCount, recentRuns };
}

/** Collect token usage from the usage table. */
async function collectTokenUsage(): Promise<TokenUsage> {
  const pool = getPool();

  const { rows } = await pool.query(
    'SELECT runid, model, total_input_tokens, total_output_tokens, by_agent FROM usage',
  );

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const byAgent: Record<string, { input: number; output: number; cost: number }> = {};

  for (const row of rows) {
    const input = (row.total_input_tokens as number | null) ?? 0;
    const output = (row.total_output_tokens as number | null) ?? 0;
    const model = (row.model as string | null) ?? '';
    const shortModel = model ? getModelShortName(model) : 'sonnet';

    totalInputTokens += input;
    totalOutputTokens += output;
    totalCostUsd += calcCost(input, output, shortModel);

    // Aggregate by_agent
    const agentData = row.by_agent as Record<string, ByAgentEntry> | null;
    if (agentData && typeof agentData === 'object') {
      for (const [agent, data] of Object.entries(agentData)) {
        const agentInput = data.input_tokens ?? 0;
        const agentOutput = data.output_tokens ?? 0;
        if (!byAgent[agent]) {
          byAgent[agent] = { input: 0, output: 0, cost: 0 };
        }
        byAgent[agent].input += agentInput;
        byAgent[agent].output += agentOutput;
        byAgent[agent].cost += calcCost(agentInput, agentOutput, shortModel);
      }
    }
  }

  // Recent token trend (most recent 20 runs)
  const { rows: trendRows } = await pool.query(
    `SELECT u.runid, u.total_input_tokens, u.total_output_tokens, u.model
     FROM usage u JOIN runs r ON u.runid = r.runid
     ORDER BY r.started_at DESC LIMIT 20`,
  );

  const recentTokenTrend = trendRows.map((r: Record<string, unknown>) => {
    const inp = (r.total_input_tokens as number | null) ?? 0;
    const out = (r.total_output_tokens as number | null) ?? 0;
    const m = (r.model as string | null) ?? '';
    const sm = m ? getModelShortName(m) : 'sonnet';
    return {
      runid: r.runid as string,
      tokens: inp + out,
      cost: calcCost(inp, out, sm),
    };
  });

  return { totalInputTokens, totalOutputTokens, totalCostUsd, byAgent, recentTokenTrend };
}

/** Collect model breakdown from the usage table. */
async function collectModelBreakdown(): Promise<ModelBreakdown[]> {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT model, COUNT(*)::int as runs,
            SUM(total_input_tokens)::bigint as total_input,
            SUM(total_output_tokens)::bigint as total_output
     FROM usage GROUP BY model`,
  );

  return rows.map((r: Record<string, unknown>) => {
    const model = (r.model as string | null) ?? '';
    const runs = (r.runs as number | null) ?? 0;
    const totalInput = Number(r.total_input ?? 0);
    const totalOutput = Number(r.total_output ?? 0);
    const shortModel = model ? getModelShortName(model) : 'sonnet';
    const totalCost = calcCost(totalInput, totalOutput, shortModel);
    return {
      model,
      label: model ? getModelLabel(model) : 'Unknown',
      runs,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCostUsd: totalCost,
      avgCostPerRun: runs > 0 ? totalCost / runs : 0,
    };
  });
}

/** Collect knowledge graph stats from the four count tables. */
async function collectKnowledgeStats(): Promise<KnowledgeStats> {
  const pool = getPool();
  const stats: KnowledgeStats = { ...emptyKnowledgeStats };

  const queries: Array<[keyof KnowledgeStats, string]> = [
    ['neuronNodes', 'SELECT COUNT(*)::int as count FROM kg_nodes'],
    ['auroraNodes', 'SELECT COUNT(*)::int as count FROM aurora_nodes'],
    ['neuronEdges', 'SELECT COUNT(*)::int as count FROM kg_edges'],
    ['auroraEdges', 'SELECT COUNT(*)::int as count FROM aurora_edges'],
  ];

  for (const [key, sql] of queries) {
    try {
      const { rows } = await pool.query(sql);
      stats[key] = (rows[0]?.count as number) ?? 0;
    } catch {
      // Table may not exist — keep zero default
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect all dashboard data (v1 beliefs + v2 extended stats).
 * Never throws — returns valid DashboardData with zero defaults on failure.
 */
export async function collectDashboardData(): Promise<DashboardData> {
  // V1 data
  let beliefs: RunBelief[] = [];
  let summary: RunSummary = { strongest: [], weakest: [], trending_up: [], trending_down: [] };
  let historyMap: Record<string, RunBeliefAudit[]> = {};

  try {
    beliefs = await getBeliefs();
    summary = await getSummary();
    for (const b of beliefs.slice(0, 10)) {
      historyMap[b.dimension] = await getBeliefHistory(b.dimension, 50);
    }
  } catch {
    // V1 data unavailable — keep defaults
  }

  // V2 data
  let runOverview: RunOverview = { ...emptyRunOverview };
  let tokenUsage: TokenUsage = { ...emptyTokenUsage };
  let modelBreakdown: ModelBreakdown[] = [];
  let knowledgeStats: KnowledgeStats = { ...emptyKnowledgeStats };

  try {
    if (await isDbAvailable()) {
      [runOverview, tokenUsage, modelBreakdown, knowledgeStats] = await Promise.all([
        collectRunOverview(),
        collectTokenUsage(),
        collectModelBreakdown(),
        collectKnowledgeStats(),
      ]);
    }
  } catch {
    // V2 data unavailable — keep defaults
  }

  return {
    beliefs, summary, historyMap,
    runOverview, tokenUsage, modelBreakdown, knowledgeStats,
  };
}
