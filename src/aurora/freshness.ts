import { getPool } from '../core/db.js';
import { AURORA_FRESHNESS } from './llm-defaults.js';

export interface FreshnessInfo {
  nodeId: string;
  title: string;
  type: string;
  confidence: number;
  lastVerified: string | null;  // ISO timestamp or null
  daysSinceVerified: number | null;  // null = aldrig verifierad
  freshnessScore: number;  // 0.0-1.0
  status: 'fresh' | 'aging' | 'stale' | 'unverified';
}

/**
 * Beräknar freshness score för en nod baserat på last_verified.
 * - Aldrig verifierad → 0.0
 * - Verifierad idag → 1.0
 * - Linjär nedgång: 1.0 → 0.0 över maxAgeDays (default 90)
 */
export function calculateFreshnessScore(
  lastVerified: Date | null,
  maxAgeDays: number = 90,
): number {
  if (!lastVerified) return 0;
  const daysSince = (Date.now() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 0) return 1;
  if (daysSince >= maxAgeDays) return 0;
  return Math.round((1 - daysSince / maxAgeDays) * 100) / 100;
}

/**
 * Bestämmer status baserat på freshness score.
 */
export function freshnessStatus(
  score: number,
  lastVerified: Date | null,
): 'fresh' | 'aging' | 'stale' | 'unverified' {
  if (!lastVerified) return 'unverified';
  if (score >= AURORA_FRESHNESS.fresh) return 'fresh';
  if (score >= AURORA_FRESHNESS.aging) return 'aging';
  return 'stale';
}

/**
 * Markerar en nod som verifierad (nu).
 * Returnerar true om noden hittades och uppdaterades.
 */
export async function verifySource(nodeId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    'UPDATE aurora_nodes SET last_verified = NOW() WHERE id = $1',
    [nodeId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Hämtar freshness-info för noder.
 */
export async function getFreshnessReport(options?: {
  topic?: string;
  limit?: number;
  onlyStale?: boolean;
}): Promise<FreshnessInfo[]> {
  const pool = getPool();
  const limit = options?.limit ?? 20;

  let query: string;
  const params: unknown[] = [];

  if (options?.onlyStale) {
    query = `
      SELECT id, title, type, confidence, last_verified,
             EXTRACT(DAY FROM NOW() - last_verified) AS days_since
      FROM aurora_nodes
      WHERE last_verified IS NULL
         OR last_verified < NOW() - INTERVAL '30 days'
      ORDER BY last_verified ASC NULLS FIRST
      LIMIT $1
    `;
    params.push(limit);
  } else {
    query = `
      SELECT id, title, type, confidence, last_verified,
             EXTRACT(DAY FROM NOW() - last_verified) AS days_since
      FROM aurora_nodes
      ORDER BY last_verified ASC NULLS FIRST
      LIMIT $1
    `;
    params.push(limit);
  }

  const { rows } = await pool.query(query, params);

  return rows.map((row: Record<string, unknown>) => {
    const lastVerified = row.last_verified
      ? new Date(row.last_verified as string)
      : null;
    const daysSince = row.days_since != null
      ? Math.floor(row.days_since as number)
      : null;
    const score = calculateFreshnessScore(lastVerified);
    const status = freshnessStatus(score, lastVerified);

    return {
      nodeId: row.id as string,
      title: row.title as string,
      type: row.type as string,
      confidence: row.confidence as number,
      lastVerified: lastVerified?.toISOString() ?? null,
      daysSinceVerified: daysSince,
      freshnessScore: score,
      status,
    };
  });
}
