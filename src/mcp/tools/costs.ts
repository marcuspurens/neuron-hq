import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPool, isDbAvailable } from '../../core/db.js';
import { calcCost, getModelShortName } from '../../core/pricing.js';

/** Register the neuron_costs MCP tool on the given server. */
export function registerCostsTool(server: McpServer): void {
  server.tool(
    'neuron_costs',
    'Get cost summary for Neuron HQ runs - total cost, per-run breakdown, agent costs',
    {
      last: z.number().optional().describe('Limit to last N runs'),
      by_agent: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include per-agent cost breakdown'),
      summary_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('Return only summary totals'),
    },
    async (args) => {
      try {
        const dbAvailable = await isDbAvailable();
        if (!dbAvailable) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Database not available. Cost data requires Postgres.',
              },
            ],
          };
        }

        const pool = getPool();
        const params: unknown[] = [];
        let query = `
          SELECT r.runid, r.target_name, r.status, r.started_at,
                 u.model, u.total_input_tokens, u.total_output_tokens, u.by_agent
          FROM runs r
          LEFT JOIN usage u ON r.runid = u.runid
          ORDER BY r.runid DESC
        `;

        if (args.last) {
          query += ` LIMIT $1`;
          params.push(args.last);
        }

        const { rows } = await pool.query(query, params);

        let totalCost = 0;
        let totalInput = 0;
        let totalOutput = 0;
        let greenCount = 0;
        const agentTotals: Record<
          string,
          { input: number; output: number; count: number }
        > = {};

        const perRun = rows.map((r: Record<string, unknown>) => {
          const inputTokens = (r.total_input_tokens as number) ?? 0;
          const outputTokens = (r.total_output_tokens as number) ?? 0;
          const modelKey = getModelShortName((r.model as string) ?? '');
          const cost = calcCost(inputTokens, outputTokens, modelKey);

          totalCost += cost;
          totalInput += inputTokens;
          totalOutput += outputTokens;
          if (((r.status as string) ?? '').toLowerCase() === 'green') {
            greenCount++;
          }

          if (args.by_agent && r.by_agent) {
            for (const [name, info] of Object.entries(
              r.by_agent as Record<string, Record<string, number>>,
            )) {
              if (!agentTotals[name]) {
                agentTotals[name] = { input: 0, output: 0, count: 0 };
              }
              agentTotals[name].input += info.input_tokens ?? 0;
              agentTotals[name].output += info.output_tokens ?? 0;
              agentTotals[name].count += 1;
            }
          }

          return {
            runid: r.runid,
            target: r.target_name,
            status: r.status,
            date: r.started_at,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost: Math.round(cost * 100) / 100,
          };
        });

        const result: Record<string, unknown> = {
          summary: {
            total_runs: rows.length,
            total_cost: Math.round(totalCost * 100) / 100,
            avg_cost:
              Math.round((totalCost / (rows.length || 1)) * 100) / 100,
            total_input_tokens: totalInput,
            total_output_tokens: totalOutput,
            green_count: greenCount,
          },
        };

        if (!args.summary_only) {
          result.runs = perRun;
        }

        if (args.by_agent) {
          const modelKey = rows[0]
            ? getModelShortName(
                ((rows[0] as Record<string, unknown>).model as string) ?? '',
              )
            : 'sonnet';
          result.agents = Object.entries(agentTotals).map(([name, t]) => ({
            agent: name,
            total_input: t.input,
            total_output: t.output,
            avg_cost:
              Math.round(
                calcCost(t.input / t.count, t.output / t.count, modelKey) *
                  100,
              ) / 100,
            runs: t.count,
          }));
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
