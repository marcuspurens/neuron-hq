import { getPool, isDbAvailable } from '../core/db.js';
import type { KMReport } from '../core/agents/knowledge-manager.js';

export interface KMRunEntry {
  id: number;
  runId: string | null;
  runNumber: number | null;
  trigger: 'auto' | 'manual-cli' | 'manual-mcp';
  topic: string | null;
  gapsFound: number;
  gapsResearched: number;
  gapsResolved: number;
  urlsIngested: number;
  factsLearned: number;
  sourcesRefreshed: number;
  durationMs: number | null;
  createdAt: Date;
}

export async function logKMRun(entry: {
  runId?: string;
  runNumber?: number;
  trigger: 'auto' | 'manual-cli' | 'manual-mcp';
  topic?: string;
  report: KMReport;
  durationMs: number;
}): Promise<number> {
  if (!(await isDbAvailable())) return -1;
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO km_runs (run_id, run_number, trigger, topic, gaps_found, gaps_researched, gaps_resolved, urls_ingested, facts_learned, sources_refreshed, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      entry.runId ?? null,
      entry.runNumber ?? null,
      entry.trigger,
      entry.topic ?? null,
      entry.report.gapsFound,
      entry.report.gapsResearched,
      entry.report.gapsResolved,
      entry.report.urlsIngested,
      entry.report.factsLearned,
      entry.report.sourcesRefreshed,
      entry.durationMs,
    ],
  );
  return rows[0].id;
}

export async function getLastAutoKMRunNumber(): Promise<number | null> {
  if (!(await isDbAvailable())) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT run_number FROM km_runs WHERE trigger = 'auto' AND run_number IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
  );
  return rows.length > 0 ? rows[0].run_number : null;
}

export async function getKMRunHistory(limit: number = 10): Promise<KMRunEntry[]> {
  if (!(await isDbAvailable())) return [];
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, run_id, run_number, trigger, topic, gaps_found, gaps_researched, gaps_resolved, urls_ingested, facts_learned, sources_refreshed, duration_ms, created_at
     FROM km_runs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r: any) => ({
    id: r.id,
    runId: r.run_id,
    runNumber: r.run_number,
    trigger: r.trigger,
    topic: r.topic,
    gapsFound: r.gaps_found,
    gapsResearched: r.gaps_researched,
    gapsResolved: r.gaps_resolved,
    urlsIngested: r.urls_ingested,
    factsLearned: r.facts_learned,
    sourcesRefreshed: r.sources_refreshed,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  }));
}
