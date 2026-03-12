import { getPool } from '../core/db.js';

// --- Types ---

/** Source reliability classification */
export type SourceType =
  | 'academic' | 'encyclopedia' | 'official'
  | 'news' | 'blog' | 'anecdotal';

export interface ConfidenceEvidence {
  /** Does the evidence support or contradict the node? */
  direction: 'supports' | 'contradicts';
  /** Source type — determines update magnitude */
  sourceType: SourceType;
  /** Optional: override weight (ignores sourceType weight) */
  weight?: number;
  /** Human-readable reason */
  reason: string;
  /** Optional metadata (source node ID, URL, similarity, etc.) */
  metadata?: Record<string, unknown>;
}

export interface ConfidenceAuditEntry {
  id: number;
  nodeId: string;
  oldConfidence: number;
  newConfidence: number;
  direction: 'supports' | 'contradicts';
  sourceType: SourceType;
  weight: number;
  reason: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// --- Source weights ---

export const SOURCE_WEIGHTS: Record<SourceType, number> = {
  academic: 0.25,
  encyclopedia: 0.20,
  official: 0.18,
  news: 0.12,
  blog: 0.06,
  anecdotal: 0.03,
};

// --- Core functions ---

/**
 * Bayesian confidence update using logistic transform.
 * Pure function — given old confidence and evidence, returns new confidence.
 */
export function bayesianUpdate(
  currentConfidence: number,
  evidence: ConfidenceEvidence,
): number {
  const weight = evidence.weight ?? SOURCE_WEIGHTS[evidence.sourceType];
  const direction = evidence.direction === 'supports' ? 1 : -1;

  // Clamp input to avoid log(0)
  const p = Math.max(0.001, Math.min(0.999, currentConfidence));
  const logit = Math.log(p / (1 - p));
  const newLogit = logit + weight * direction;
  const newP = 1 / (1 + Math.exp(-newLogit));

  // Round to 4 decimals
  return Math.round(newP * 10000) / 10000;
}

/**
 * Update confidence for an Aurora node and log the change.
 * Reads current confidence from DB, applies bayesianUpdate(), writes back.
 */
export async function updateConfidence(
  nodeId: string,
  evidence: ConfidenceEvidence,
): Promise<{ oldConfidence: number; newConfidence: number }> {
  const pool = getPool();

  // Get current confidence
  const { rows } = await pool.query(
    'SELECT confidence FROM aurora_nodes WHERE id = $1',
    [nodeId],
  );
  if (rows.length === 0) {
    throw new Error(`Aurora node not found: ${nodeId}`);
  }
  const oldConfidence = rows[0].confidence as number;

  // Compute new confidence
  const newConfidence = bayesianUpdate(oldConfidence, evidence);

  // Update node
  await pool.query(
    'UPDATE aurora_nodes SET confidence = $1, updated = NOW() WHERE id = $2',
    [newConfidence, nodeId],
  );

  // Log to audit table
  const weight = evidence.weight ?? SOURCE_WEIGHTS[evidence.sourceType];
  await pool.query(
    `INSERT INTO confidence_audit
       (node_id, old_confidence, new_confidence, direction, source_type, weight, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      nodeId,
      oldConfidence,
      newConfidence,
      evidence.direction,
      evidence.sourceType,
      weight,
      evidence.reason,
      JSON.stringify(evidence.metadata ?? {}),
    ],
  );

  return { oldConfidence, newConfidence };
}

/**
 * Get confidence change history for a node (most recent first).
 */
export async function getConfidenceHistory(
  nodeId: string,
  limit = 20,
): Promise<ConfidenceAuditEntry[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, node_id, old_confidence, new_confidence, direction,
            source_type, weight, reason, metadata, timestamp
     FROM confidence_audit
     WHERE node_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [nodeId, limit],
  );
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as number,
    nodeId: r.node_id as string,
    oldConfidence: r.old_confidence as number,
    newConfidence: r.new_confidence as number,
    direction: r.direction as 'supports' | 'contradicts',
    sourceType: r.source_type as SourceType,
    weight: r.weight as number,
    reason: r.reason as string,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    timestamp: (r.timestamp as Date).toISOString(),
  }));
}

/**
 * Classify a URL into a source type based on domain patterns.
 * Falls back to 'blog' for unknown sources.
 */
export function classifySource(url: string | null): SourceType {
  if (!url) return 'anecdotal';
  const lower = url.toLowerCase();

  // Academic
  if (/arxiv\.org|scholar\.google|doi\.org|pubmed|\.edu\/|jstor\.org|nature\.com|science\.org/.test(lower)) {
    return 'academic';
  }
  // Encyclopedia
  if (/wikipedia\.org|britannica\.com|snl\.no/.test(lower)) {
    return 'encyclopedia';
  }
  // Official
  if (/\.gov|europa\.eu|who\.int|research\.google/.test(lower)) {
    return 'official';
  }
  // News
  if (/reuters\.com|bbc\.com|nytimes\.com|svt\.se|dn\.se|theguardian\.com|washingtonpost\.com/.test(lower)) {
    return 'news';
  }
  // Blog — default for web sources
  return 'blog';
}
