import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { BASE_DIR } from '../cli.js';
import { getPool, isDbAvailable } from '../core/db.js';
import { getModelShortName, getModelLabel, calcCost } from '../core/pricing.js';
import { type RunCostRow, loadRunData, saveCostTracking, updateCostTracking } from '../core/cost-tracking.js';

export { updateCostTracking };

/**
 * Load all run cost data from the database.
 * Returns null if DB is not available.
 */
async function loadRunDataFromDb(limit?: number): Promise<RunCostRow[] | null> {
  try {
    if (!(await isDbAvailable())) return null;

    const pool = getPool();

    let query = `
      SELECT 
        r.runid, r.target_name, r.status, r.started_at, r.completed_at,
        u.model, u.total_input_tokens, u.total_output_tokens, u.by_agent
      FROM runs r
      LEFT JOIN usage u ON r.runid = u.runid
      ORDER BY r.runid ASC
    `;

    if (limit) {
      query = `
        SELECT * FROM (
          SELECT 
            r.runid, r.target_name, r.status, r.started_at, r.completed_at,
            u.model, u.total_input_tokens, u.total_output_tokens, u.by_agent
          FROM runs r
          LEFT JOIN usage u ON r.runid = u.runid
          ORDER BY r.runid DESC
          LIMIT ${limit}
        ) sub ORDER BY sub.runid ASC
      `;
    }

    const { rows } = await pool.query(query);

    if (rows.length === 0) return null;

    return rows.map((r: Record<string, unknown>) => {
      const runid = r.runid as string;
      const inputTokens = (r.total_input_tokens as number) ?? 0;
      const outputTokens = (r.total_output_tokens as number) ?? 0;
      const model = (r.model as string) ?? '';
      const modelKey = getModelShortName(model);
      const modelLabel = getModelLabel(model);
      const cost = calcCost(inputTokens, outputTokens, modelKey);
      const byAgent = (r.by_agent ?? {}) as Record<string, unknown>;
      const agents = Object.keys(byAgent).length;

      const date = `${runid.slice(0, 4)}-${runid.slice(4, 6)}-${runid.slice(6, 8)}`;
      const time = `${runid.slice(9, 11)}:${runid.slice(11, 13)}`;

      let durationMin: number | null = null;
      if (r.started_at && r.completed_at) {
        const start = new Date(r.started_at as string).getTime();
        const end = new Date(r.completed_at as string).getTime();
        durationMin = (end - start) / 60_000;
      }

      const status = ((r.status as string) ?? '?').toUpperCase();

      return {
        runid,
        date,
        time,
        task: r.target_name as string ?? '?',
        status,
        model: modelKey,
        modelLabel,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cost,
        agents,
        durationMin,
      };
    });
  } catch (err) {
    console.error('[costs] loading cost data failed:', err);
    return null;
  }
}

export async function costsCommand(options: { last?: string; save?: boolean }): Promise<void> {
  const runsDir = path.join(BASE_DIR, 'runs');

  // Try loading from DB first
  const limit = options.last ? parseInt(options.last, 10) : undefined;
  let rows = await loadRunDataFromDb(limit);

  if (!rows) {
    // Fallback to file scanning
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(runsDir, { withFileTypes: true });
      entries = dirEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {  /* intentional: run cost data may not be available */
      console.log(chalk.yellow('No runs directory found.'));
      return;
    }

    const fileLimit = options.last ? parseInt(options.last, 10) : entries.length;
    const selected = entries.slice(-fileLimit);

    rows = (
      await Promise.all(selected.map((runid) => loadRunData(runsDir, runid)))
    ).filter((r): r is RunCostRow => r !== null);
  }

  if (rows.length === 0) {
    console.log(chalk.yellow('No runs with usage data found.'));
    return;
  }

  // --- Console output ---
  const header = `  #  Datum        Tid    Uppgift                              Status  Input    Output   Totalt   Kostnad  Agenter  Körtid`;
  const sep = '─'.repeat(header.length + 4);

  console.log(chalk.bold(`\nNeuron HQ — Kostnadsrapport (${rows.length} körningar)\n`));
  console.log(sep);
  console.log(chalk.bold(header));
  console.log(sep);

  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;
  let greenCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    totalCost += r.cost;
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    if (r.status === 'GREEN') greenCount++;

    const num = String(i + 1).padStart(3);
    const taskShort = r.task.length > 35 ? r.task.slice(0, 34) + '…' : r.task.padEnd(35);
    const dur = r.durationMin ? `${Math.round(r.durationMin)}m`.padStart(5) : '    ?';
    const statusColor =
      r.status === 'GREEN' ? chalk.green(r.status.padEnd(6)) :
      r.status === 'RED' ? chalk.red(r.status.padEnd(6)) :
      chalk.gray(r.status.padEnd(6));

    console.log(
      ` ${num}  ${r.date}  ${r.time}  ${taskShort}  ${statusColor}  ` +
      `${(r.inputTokens / 1e6).toFixed(1).padStart(5)}M  ` +
      `${(r.outputTokens / 1e6).toFixed(2).padStart(6)}M  ` +
      `${(r.totalTokens / 1e6).toFixed(1).padStart(5)}M  ` +
      `$${r.cost.toFixed(2).padStart(6)}  ` +
      `${String(r.agents).padStart(7)}  ${dur}`
    );
  }

  console.log(sep);
  console.log(
    chalk.bold(
      `      TOTALT${' '.repeat(55)}` +
      `${(totalIn / 1e6).toFixed(1).padStart(5)}M  ` +
      `${(totalOut / 1e6).toFixed(2).padStart(6)}M  ` +
      `${((totalIn + totalOut) / 1e6).toFixed(1).padStart(5)}M  ` +
      `$${totalCost.toFixed(2).padStart(6)}`
    )
  );
  console.log(
    chalk.bold(
      `      SNITT ${' '.repeat(55)}` +
      `${(totalIn / rows.length / 1e6).toFixed(1).padStart(5)}M  ` +
      `${(totalOut / rows.length / 1e6).toFixed(2).padStart(6)}M  ` +
      `${((totalIn + totalOut) / rows.length / 1e6).toFixed(1).padStart(5)}M  ` +
      `$${(totalCost / rows.length).toFixed(2).padStart(6)}`
    )
  );

  console.log(`\n  GREEN: ${greenCount}/${rows.length} | Modell: ${rows[0].modelLabel}\n`);

  // --- Per-agent breakdown ---
  const agentTotals: Record<string, { in: number; out: number; count: number }> = {};
  for (const r of rows) {
    const usagePath = path.join(runsDir, r.runid, 'usage.json');
    try {
      const usage = JSON.parse(await fs.readFile(usagePath, 'utf-8'));
      for (const [name, info] of Object.entries(usage.by_agent ?? {})) {
        const agentInfo = info as { input_tokens: number; output_tokens: number };
        if (!agentTotals[name]) agentTotals[name] = { in: 0, out: 0, count: 0 };
        agentTotals[name].in += agentInfo.input_tokens;
        agentTotals[name].out += agentInfo.output_tokens;
        agentTotals[name].count += 1;
      }
    } catch { /* intentional: skip */ }
  }

  console.log(chalk.bold('  Kostnad per agent (genomsnitt per körning)'));
  console.log('  ' + '─'.repeat(70));
  console.log(chalk.bold('  Agent            Snitt tokens   Kostnad/körning  Andel'));
  console.log('  ' + '─'.repeat(70));

  const agentOrder = ['manager', 'implementer', 'reviewer', 'tester', 'merger', 'researcher', 'historian', 'librarian', 'consolidator'];
  for (const name of agentOrder) {
    const t = agentTotals[name];
    if (!t) continue;
    const modelKey = rows[0].model;
    const avgCost = calcCost(t.in / t.count, t.out / t.count, modelKey);
    const avgTok = (t.in + t.out) / t.count / 1e6;
    const totalAgentCost = calcCost(t.in, t.out, modelKey);
    const pct = (totalAgentCost / totalCost) * 100;
    console.log(
      `  ${name.padEnd(17)} ${avgTok.toFixed(2).padStart(8)}M   $${avgCost.toFixed(2).padStart(6)}/körning  ${pct.toFixed(1).padStart(5)}%`
    );
  }
  console.log('  ' + '─'.repeat(70));

  // --- Save to file if requested ---
  if (options.save) {
    await saveCostTracking(runsDir, rows, agentTotals, totalCost, totalIn, totalOut, greenCount);
    console.log(chalk.green(`\n  Sparad: ${path.join(BASE_DIR, 'docs', 'cost-tracking.md')}\n`));
  }
}
