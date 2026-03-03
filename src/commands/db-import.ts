import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import type { Pool } from 'pg';
import { getPool, closePool, isDbAvailable } from '../core/db.js';
import { runMigrations } from '../core/migrate.js';
import { BASE_DIR } from '../cli.js';

/**
 * CLI command: import existing file-based data into Postgres.
 * Reads graph, runs, audit, and task scores from the file system.
 */
export async function dbImportCommand(): Promise<void> {
  console.log(chalk.bold('\nNeuron HQ — Database Import\n'));

  if (!(await isDbAvailable())) {
    console.log(chalk.red('❌ Database not available. Set DATABASE_URL or start Postgres.'));
    await closePool();
    return;
  }

  const pool = getPool();

  try {
    // Run migrations first
    const applied = await runMigrations(pool);
    if (applied.length > 0) {
      console.log(chalk.green(`  Applied ${applied.length} migration(s) first.\n`));
    }

    await importGraph(pool);
    await importRuns(pool);
    await importAudit(pool);
    await importTaskScores(pool);

    console.log(chalk.bold('\n  ✅ Import complete.\n'));
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Import failed: ${err instanceof Error ? err.message : err}\n`));
  } finally {
    await closePool();
  }
}

/** Import knowledge graph nodes and edges from graph.json. */
async function importGraph(pool: Pool): Promise<void> {
  const graphPath = path.join(BASE_DIR, 'memory', 'graph.json');
  try {
    const raw = await fs.readFile(graphPath, 'utf-8');
    const graph = JSON.parse(raw);

    let nodeCount = 0;
    for (const node of graph.nodes ?? []) {
      await pool.query(
        `INSERT INTO kg_nodes (id, type, title, properties, confidence, scope, model, created, updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          node.id,
          node.type,
          node.title,
          JSON.stringify(node.properties ?? {}),
          node.confidence ?? 0.5,
          node.scope ?? 'unknown',
          node.model ?? null,
          node.created ?? new Date().toISOString(),
          node.updated ?? new Date().toISOString(),
        ],
      );
      nodeCount++;
    }

    let edgeCount = 0;
    for (const edge of graph.edges ?? []) {
      await pool.query(
        `INSERT INTO kg_edges (from_id, to_id, type, metadata)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (from_id, to_id, type) DO NOTHING`,
        [edge.from, edge.to, edge.type, JSON.stringify(edge.metadata ?? {})],
      );
      edgeCount++;
    }

    console.log(`  Graph: ${nodeCount} nodes, ${edgeCount} edges imported`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(chalk.yellow('  Graph: No graph.json found, skipping'));
    } else {
      throw err;
    }
  }
}

/** Import run manifests, usage, and metrics from the runs directory. */
async function importRuns(pool: Pool): Promise<void> {
  const runsDir = path.join(BASE_DIR, 'runs');
  let entries: string[];
  try {
    const dirEntries = await fs.readdir(runsDir, { withFileTypes: true });
    entries = dirEntries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    console.log(chalk.yellow('  Runs: No runs directory found, skipping'));
    return;
  }

  let runCount = 0;
  let usageCount = 0;
  let metricsCount = 0;

  for (const runid of entries) {
    const runDir = path.join(runsDir, runid);

    // Import run manifest
    try {
      const manifestPath = path.join(runDir, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

      let status: string | null = null;
      try {
        const report = await fs.readFile(path.join(runDir, 'report.md'), 'utf-8');
        if (report.includes('GREEN')) status = 'green';
        else if (report.includes('RED')) status = 'red';
        else if (report.includes('YELLOW')) status = 'yellow';
      } catch { /* no report */ }

      const targetName = manifest.target_name ?? runid.replace(/^\d{8}-\d{4}-/, '');

      await pool.query(
        `INSERT INTO runs (runid, target_name, brief_title, status, started_at, completed_at, model, workspace_branch, target_start_sha)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (runid) DO NOTHING`,
        [
          runid,
          targetName,
          null,
          status,
          manifest.started_at ?? new Date().toISOString(),
          manifest.completed_at ?? null,
          null,
          manifest.workspace_branch ?? null,
          manifest.target_start_sha ?? null,
        ],
      );
      runCount++;
    } catch {
      const targetName = runid.replace(/^\d{8}-\d{4}-/, '').replace(/-resume$/, '');
      await pool.query(
        `INSERT INTO runs (runid, target_name, started_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (runid) DO NOTHING`,
        [runid, targetName, new Date().toISOString()],
      );
      runCount++;
    }

    // Import usage
    try {
      const usagePath = path.join(runDir, 'usage.json');
      const usage = JSON.parse(await fs.readFile(usagePath, 'utf-8'));
      await pool.query(
        `INSERT INTO usage (runid, model, total_input_tokens, total_output_tokens, by_agent, tool_counts)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (runid) DO NOTHING`,
        [
          runid,
          usage.model ?? null,
          usage.total_input_tokens ?? 0,
          usage.total_output_tokens ?? 0,
          JSON.stringify(usage.by_agent ?? {}),
          JSON.stringify(usage.tool_counts ?? {}),
        ],
      );
      usageCount++;
    } catch { /* no usage.json */ }

    // Import metrics
    try {
      const metricsPath = path.join(runDir, 'metrics.json');
      const m = JSON.parse(await fs.readFile(metricsPath, 'utf-8'));
      await pool.query(
        `INSERT INTO metrics (runid, duration_seconds, tests_baseline_passed, tests_baseline_failed,
         tests_after_passed, tests_after_failed, tests_added, insertions, deletions,
         files_new, files_modified, delegations_total, re_delegations, commands_run,
         commands_blocked, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (runid) DO NOTHING`,
        [
          runid,
          m.duration_seconds ?? null,
          m.tests?.baseline_passed ?? null,
          m.tests?.baseline_failed ?? null,
          m.tests?.after_passed ?? null,
          m.tests?.after_failed ?? null,
          m.tests?.added ?? null,
          m.diff?.insertions ?? null,
          m.diff?.deletions ?? null,
          m.diff?.files_new ?? null,
          m.diff?.files_modified ?? null,
          m.delegations?.total ?? null,
          m.delegations?.re_delegations ?? null,
          m.commands?.run ?? null,
          m.commands?.blocked ?? null,
          JSON.stringify(m),
        ],
      );
      metricsCount++;
    } catch { /* no metrics.json */ }
  }

  console.log(`  Runs: ${runCount} runs, ${usageCount} usage, ${metricsCount} metrics imported`);
}

/**
 * Import audit entries from audit.jsonl files.
 * Idempotent: skips runs that already have audit entries in the database.
 */
async function importAudit(pool: Pool): Promise<void> {
  const runsDir = path.join(BASE_DIR, 'runs');
  let entries: string[];
  try {
    const dirEntries = await fs.readdir(runsDir, { withFileTypes: true });
    entries = dirEntries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return;
  }

  let totalEntries = 0;

  for (const runid of entries) {
    // Check if audit entries already exist for this run (idempotency)
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM audit_entries WHERE runid = $1',
      [runid],
    );
    if (rows[0].cnt > 0) continue;

    const auditPath = path.join(runsDir, runid, 'audit.jsonl');
    try {
      const content = await fs.readFile(auditPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const entry = JSON.parse(line);
        await pool.query(
          `INSERT INTO audit_entries (runid, ts, role, tool, allowed, input_hash, output_hash,
           exit_code, files_touched, diff_additions, diff_deletions, policy_event, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            runid,
            entry.ts,
            entry.role,
            entry.tool,
            entry.allowed ?? true,
            entry.input_hash ?? null,
            entry.output_hash ?? null,
            entry.exit_code ?? null,
            entry.files_touched ?? null,
            entry.diff_stats?.additions ?? null,
            entry.diff_stats?.deletions ?? null,
            entry.policy_event ?? null,
            entry.note ?? null,
          ],
        );
        totalEntries++;
      }
    } catch { /* no audit.jsonl */ }
  }

  console.log(`  Audit: ${totalEntries} entries imported`);
}

/** Import task scores from task_scores.jsonl files. */
async function importTaskScores(pool: Pool): Promise<void> {
  const runsDir = path.join(BASE_DIR, 'runs');
  let entries: string[];
  try {
    const dirEntries = await fs.readdir(runsDir, { withFileTypes: true });
    entries = dirEntries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return;
  }

  let totalScores = 0;

  for (const runid of entries) {
    const scoresPath = path.join(runsDir, runid, 'task_scores.jsonl');
    try {
      const content = await fs.readFile(scoresPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const s = JSON.parse(line);
        await pool.query(
          `INSERT INTO task_scores (runid, task_id, description, iterations_used, tokens_input,
           tokens_output, commands_run, commands_blocked, diff_insertions, diff_deletions,
           re_delegations, score_efficiency, score_safety, score_first_pass, aggregate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (runid, task_id) DO NOTHING`,
          [
            runid,
            s.task_id,
            s.description ?? null,
            s.iterations_used ?? null,
            s.tokens_input ?? null,
            s.tokens_output ?? null,
            s.commands_run ?? null,
            s.commands_blocked ?? null,
            s.diff_insertions ?? null,
            s.diff_deletions ?? null,
            s.re_delegations ?? null,
            s.score_efficiency ?? null,
            s.score_safety ?? null,
            s.score_first_pass ?? null,
            s.aggregate ?? null,
          ],
        );
        totalScores++;
      }
    } catch { /* no task_scores.jsonl */ }
  }

  console.log(`  Task scores: ${totalScores} entries imported`);
}

export { importGraph, importRuns, importAudit, importTaskScores };
