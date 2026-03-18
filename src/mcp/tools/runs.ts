import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPool, isDbAvailable } from '../../core/db.js';
import { calcCost, getModelShortName } from '../../core/pricing.js';
import fs from 'fs/promises';
import path from 'path';

const RUNS_DIR = path.resolve(import.meta.dirname ?? '.', '../../../runs');

/** Register the neuron_runs MCP tool on the given server. */
export function registerRunsTool(server: McpServer): void {
  server.tool(
    'neuron_runs',
    'List and filter Neuron HQ runs with status, cost, and test results',
    {
      status: z
        .enum(['green', 'yellow', 'red', 'error', 'stopped', 'running'])
        .optional()
        .describe('Filter by run status'),
      target: z.string().optional().describe('Filter by target name'),
      last: z.number().optional().default(10).describe('Number of recent runs to return'),
      runid: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional().describe('Get details for a specific run'),
    },
    async (args) => {
      try {
        if (args.runid) {
          return await getRunDetail(args.runid);
        }
        return await listRuns(args);
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  );
}

async function listRuns(args: {
  status?: string;
  target?: string;
  last: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const dbAvail = await isDbAvailable();

  if (dbAvail) {
    return await listRunsFromDb(args);
  }
  return await listRunsFromFs(args);
}

async function listRunsFromDb(args: {
  status?: string;
  target?: string;
  last: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const pool = getPool();
  const params: unknown[] = [];
  let paramIdx = 1;

  let where = '';
  if (args.status) {
    where += ` AND r.status = $${paramIdx}`;
    params.push(args.status);
    paramIdx++;
  }
  if (args.target) {
    where += ` AND r.target_name = $${paramIdx}`;
    params.push(args.target);
    paramIdx++;
  }

  params.push(args.last);

  const query = `
    SELECT r.runid, r.target_name, r.status, r.started_at, r.completed_at,
           u.model, u.total_input_tokens, u.total_output_tokens
    FROM runs r
    LEFT JOIN usage u ON r.runid = u.runid
    WHERE 1=1 ${where}
    ORDER BY r.runid DESC
    LIMIT $${paramIdx}
  `;

  const { rows } = await pool.query(query, params);

  const results = rows.map((r: Record<string, unknown>) => {
    const inputTokens = (r.total_input_tokens as number) ?? 0;
    const outputTokens = (r.total_output_tokens as number) ?? 0;
    const modelKey = getModelShortName((r.model as string) ?? '');
    const cost = calcCost(inputTokens, outputTokens, modelKey);

    return {
      runid: r.runid,
      target: r.target_name,
      status: r.status,
      started_at: r.started_at,
      completed_at: r.completed_at,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost: Math.round(cost * 100) / 100,
    };
  });

  return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
}

async function listRunsFromFs(args: {
  status?: string;
  target?: string;
  last: number;
}): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  let entries: string[];
  try {
    const dirEntries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return { content: [{ type: 'text' as const, text: '[]' }] };
  }

  const results = [];
  for (const runid of entries) {
    if (results.length >= args.last) break;

    try {
      const manifestPath = path.join(RUNS_DIR, runid, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

      if (args.status && manifest.status !== args.status) continue;
      if (args.target && manifest.target !== args.target) continue;

      let cost = 0;
      try {
        const usagePath = path.join(RUNS_DIR, runid, 'usage.json');
        const usage = JSON.parse(await fs.readFile(usagePath, 'utf-8'));
        const modelKey = getModelShortName(usage.model ?? '');
        cost = calcCost(usage.total_input_tokens ?? 0, usage.total_output_tokens ?? 0, modelKey);
      } catch {
        /* no usage file */
      }

      results.push({
        runid,
        target: manifest.target,
        status: manifest.status,
        started_at: manifest.started_at,
        completed_at: manifest.completed_at,
        cost: Math.round(cost * 100) / 100,
      });
    } catch {
      /* skip invalid dirs */
    }
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
}

async function getRunDetail(
  runid: string,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  let runData: Record<string, unknown> = { runid };

  const dbAvail = await isDbAvailable();
  if (dbAvail) {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT r.runid, r.target_name, r.status, r.started_at, r.completed_at,
              u.model, u.total_input_tokens, u.total_output_tokens, u.by_agent
       FROM runs r
       LEFT JOIN usage u ON r.runid = u.runid
       WHERE r.runid = $1`,
      [runid],
    );
    if (rows.length > 0) {
      const r = rows[0];
      const inputTokens = (r.total_input_tokens as number) ?? 0;
      const outputTokens = (r.total_output_tokens as number) ?? 0;
      const modelKey = getModelShortName((r.model as string) ?? '');
      runData = {
        ...runData,
        target: r.target_name,
        status: r.status,
        started_at: r.started_at,
        completed_at: r.completed_at,
        model: r.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost: Math.round(calcCost(inputTokens, outputTokens, modelKey) * 100) / 100,
        by_agent: r.by_agent,
      };
    }
  }

  // Try to read brief and report from filesystem
  const runDir = path.join(RUNS_DIR, runid);
  try {
    runData.brief = await fs.readFile(path.join(runDir, 'brief.md'), 'utf-8');
  } catch {
    /* no brief */
  }
  try {
    runData.report = await fs.readFile(path.join(runDir, 'report.md'), 'utf-8');
  } catch {
    /* no report */
  }

  return { content: [{ type: 'text' as const, text: JSON.stringify(runData, null, 2) }] };
}
