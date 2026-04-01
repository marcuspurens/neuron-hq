import chalk from 'chalk';
import { getPool, closePool, isDbAvailable } from '../core/db.js';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AffectedNode {
  id: string;
  title: string;
  type: string;
  oldConfidence: number;
  newConfidence: number;
}

interface DecayReport {
  timestamp: string;
  dryRun: boolean;
  parameters: {
    inactiveDays: number;
    decayFactor: number;
  };
  summary: {
    nodesAffected: number;
    avgConfidenceBefore: number;
    avgConfidenceAfter: number;
  };
  nodes: AffectedNode[];
}

/* ------------------------------------------------------------------ */
/*  Report persistence                                                 */
/* ------------------------------------------------------------------ */

/** Save decay report as JSON log file under logs/decay/. */
async function saveDecayLog(report: DecayReport): Promise<string> {
  const logsDir = path.resolve(__dirname, '../../logs/decay');
  await mkdir(logsDir, { recursive: true });

  const ts = report.timestamp.replace(/:/g, '').slice(0, 15); // 20260329T212856
  const suffix = report.dryRun ? '-dryrun' : '';
  const filename = `decay-${ts}${suffix}.json`;
  const filePath = path.join(logsDir, filename);

  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}

/** Create an Aurora fact node summarizing the decay run. */
async function saveDecayAuroraNode(
  pool: ReturnType<typeof getPool>,
  report: DecayReport
): Promise<string> {
  const dateStr = report.timestamp.slice(0, 10);
  const nodeId = `decay-${dateStr}-${Date.now().toString(36)}`;

  // Build human-readable summary
  const topAffected = report.nodes
    .sort((a, b) => a.oldConfidence - a.newConfidence - (b.oldConfidence - b.newConfidence))
    .slice(0, 10)
    .map(
      (n) => `${n.title} (${n.type}): ${n.oldConfidence.toFixed(2)} → ${n.newConfidence.toFixed(2)}`
    )
    .join('\n');

  const summary = [
    `Confidence decay kördes ${dateStr}.`,
    `${report.summary.nodesAffected} noder påverkades.`,
    `Snitt-confidence: ${report.summary.avgConfidenceBefore.toFixed(2)} → ${report.summary.avgConfidenceAfter.toFixed(2)}.`,
    `Parametrar: ${report.parameters.inactiveDays} dagars inaktivitet, faktor ${report.parameters.decayFactor}.`,
    report.nodes.length > 0 ? `\nMest påverkade:\n${topAffected}` : '',
  ].join('\n');

  const now = new Date().toISOString();

  await pool.query(
    `INSERT INTO aurora_nodes (id, type, title, properties, confidence, scope, created, updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       properties = EXCLUDED.properties,
       updated = EXCLUDED.updated`,
    [
      nodeId,
      'fact',
      `Confidence decay ${dateStr}`,
      JSON.stringify({
        text: summary,
        decay_report: {
          nodes_affected: report.summary.nodesAffected,
          avg_before: report.summary.avgConfidenceBefore,
          avg_after: report.summary.avgConfidenceAfter,
          parameters: report.parameters,
          dry_run: report.dryRun,
        },
        tags: ['system', 'decay', 'maintenance'],
      }),
      0.9,
      'project',
      now,
      now,
    ]
  );

  return nodeId;
}

/* ------------------------------------------------------------------ */
/*  CLI command                                                        */
/* ------------------------------------------------------------------ */

/**
 * CLI command: aurora:decay
 * Applies confidence decay to Aurora nodes not updated recently.
 * Saves a JSON log file + an Aurora fact node documenting what happened.
 */
export async function auroraDecayCommand(options: {
  dryRun?: boolean;
  days?: string;
  factor?: string;
}): Promise<void> {
  const inactiveDays = parseInt(options.days ?? '20', 10);
  const decayFactor = parseFloat(options.factor ?? '0.9');
  const dryRun = options.dryRun ?? false;

  console.log(chalk.bold('\nAurora Confidence Decay'));
  console.log('─────────────────────────\n');

  if (!(await isDbAvailable())) {
    console.log(chalk.yellow('  Database not available.\n'));
    await closePool();
    return;
  }

  const pool = getPool();

  try {
    // --- Step 1: Snapshot nodes that will be affected ---
    const { rows: beforeRows } = await pool.query(
      `SELECT id, title, type, confidence
       FROM aurora_nodes
       WHERE updated < NOW() - make_interval(days => $1)
         AND confidence > 0.01
       ORDER BY confidence DESC`,
      [inactiveDays]
    );

    const affectedCount = beforeRows.length;

    if (dryRun) {
      // Dry run: calculate what would happen without changing data
      const nodes: AffectedNode[] = beforeRows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        type: r.type as string,
        oldConfidence: r.confidence as number,
        newConfidence: Math.round((r.confidence as number) * decayFactor * 1000) / 1000,
      }));

      const avgBefore =
        affectedCount > 0 ? nodes.reduce((s, n) => s + n.oldConfidence, 0) / affectedCount : 0;
      const avgAfter =
        affectedCount > 0 ? nodes.reduce((s, n) => s + n.newConfidence, 0) / affectedCount : 0;

      const report: DecayReport = {
        timestamp: new Date().toISOString(),
        dryRun: true,
        parameters: { inactiveDays, decayFactor },
        summary: {
          nodesAffected: affectedCount,
          avgConfidenceBefore: avgBefore,
          avgConfidenceAfter: avgAfter,
        },
        nodes,
      };

      // Save log + Aurora node even for dry run
      const logPath = await saveDecayLog(report);
      const nodeId = await saveDecayAuroraNode(pool, report);

      console.log(chalk.yellow('  DRY RUN — no confidence values changed\n'));
      console.log(`  Nodes affected: ${affectedCount}`);
      console.log(`  Decay factor: ${decayFactor}`);
      console.log(`  Inactive threshold: ${inactiveDays} days`);
      console.log(
        `  Avg confidence: ${avgBefore.toFixed(2)} → ${avgAfter.toFixed(2)} (projected)\n`
      );
      console.log(chalk.cyan(`  📄 Log: ${logPath}`));
      console.log(chalk.cyan(`  🧠 Aurora node: ${nodeId}\n`));

      if (nodes.length > 0) {
        console.log(chalk.dim('  Top affected nodes:'));
        for (const n of nodes.slice(0, 10)) {
          console.log(
            chalk.dim(
              `    ${n.title} (${n.type}): ${n.oldConfidence.toFixed(2)} → ${n.newConfidence.toFixed(2)}`
            )
          );
        }
        console.log('');
      }
    } else {
      // --- Step 2: Apply decay ---
      const { rows } = await pool.query('SELECT * FROM decay_confidence($1, $2, $3)', [
        'aurora_nodes',
        inactiveDays,
        decayFactor,
      ]);
      const result = rows[0];
      const updatedCount = (result?.updated_count ?? 0) as number;
      const avgBefore = (result?.avg_before ?? 0) as number;
      const avgAfter = (result?.avg_after ?? 0) as number;

      // --- Step 3: Fetch new confidence values for affected nodes ---
      const nodeIds = beforeRows.map((r: Record<string, unknown>) => r.id as string);
      let nodes: AffectedNode[] = [];

      if (nodeIds.length > 0) {
        const { rows: afterRows } = await pool.query(
          `SELECT id, title, type, confidence
           FROM aurora_nodes
           WHERE id = ANY($1)
           ORDER BY confidence DESC`,
          [nodeIds]
        );

        const afterMap = new Map<string, number>();
        for (const r of afterRows) {
          afterMap.set(r.id as string, r.confidence as number);
        }

        nodes = beforeRows.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          title: r.title as string,
          type: r.type as string,
          oldConfidence: r.confidence as number,
          newConfidence: afterMap.get(r.id as string) ?? (r.confidence as number),
        }));
      }

      const report: DecayReport = {
        timestamp: new Date().toISOString(),
        dryRun: false,
        parameters: { inactiveDays, decayFactor },
        summary: {
          nodesAffected: updatedCount,
          avgConfidenceBefore: avgBefore,
          avgConfidenceAfter: avgAfter,
        },
        nodes,
      };

      // Save log + Aurora node
      const logPath = await saveDecayLog(report);
      const nodeId = await saveDecayAuroraNode(pool, report);

      console.log(`  Nodes affected: ${updatedCount}`);
      console.log(`  Avg confidence: ${avgBefore.toFixed(2)} → ${avgAfter.toFixed(2)}`);
      console.log(`  Decay factor: ${decayFactor}`);
      console.log(`  Inactive threshold: ${inactiveDays} days\n`);
      console.log(chalk.cyan(`  📄 Log: ${logPath}`));
      console.log(chalk.cyan(`  🧠 Aurora node: ${nodeId}\n`));

      if (nodes.length > 0) {
        console.log(chalk.dim('  Top affected nodes:'));
        for (const n of nodes.slice(0, 10)) {
          console.log(
            chalk.dim(
              `    ${n.title} (${n.type}): ${n.oldConfidence.toFixed(2)} → ${n.newConfidence.toFixed(2)}`
            )
          );
        }
        console.log('');
      }
    }
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  } finally {
    await closePool();
  }
}
