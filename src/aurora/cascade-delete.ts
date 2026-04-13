import { getPool, isDbAvailable } from '../core/db.js';
import {
  loadAuroraGraph,
  removeAuroraNode,
  saveAuroraGraph,
} from './aurora-graph.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('aurora:cascade-delete');

export interface CascadeDeleteResult {
  deleted: boolean;
  nodeId: string;
  reason?: string;
  chunksRemoved: number;
  voicePrintsRemoved: number;
  speakerIdentitiesRemoved: number;
  crossRefsRemoved: number;
}

export async function cascadeDeleteAuroraNode(
  nodeId: string,
): Promise<CascadeDeleteResult> {
  const result: CascadeDeleteResult = {
    deleted: false,
    nodeId,
    chunksRemoved: 0,
    voicePrintsRemoved: 0,
    speakerIdentitiesRemoved: 0,
    crossRefsRemoved: 0,
  };

  const dbAvailable = await isDbAvailable();
  if (!dbAvailable) {
    result.reason = 'db_unavailable';
    logger.warn('Cannot cascade delete — database unavailable', { nodeId });
    return result;
  }

  const pool = getPool();

  // 1. Check node exists
  const nodeCheck = await pool.query(
    'SELECT id FROM aurora_nodes WHERE id = $1',
    [nodeId],
  );
  if (nodeCheck.rows.length === 0) {
    result.reason = 'not_found';
    return result;
  }

  // 2. Collect child IDs: chunks (regex to avoid LIKE _ wildcard issues)
  const chunkRows = await pool.query(
    `SELECT id FROM aurora_nodes WHERE id ~ ('^' || $1 || '_chunk_\\d+$')`,
    [nodeId],
  );
  const chunkIds = chunkRows.rows.map((r: { id: string }) => r.id);

  // 3. Collect voice print IDs
  const vpRows = await pool.query(
    `SELECT id FROM aurora_nodes WHERE type = 'voice_print' AND properties->>'videoNodeId' = $1`,
    [nodeId],
  );
  const vpIds = vpRows.rows.map((r: { id: string }) => r.id);

  // 4. Resolve speaker identity dependencies BEFORE deleting edges
  const speakerIdsToDelete: string[] = [];
  const speakerIdsToUpdate: Array<{ id: string; remainingVps: string[] }> = [];

  if (vpIds.length > 0) {
    const speakerRows = await pool.query(
      `SELECT DISTINCT ae.to_id AS speaker_id
       FROM aurora_edges ae
       JOIN aurora_nodes an ON an.id = ae.to_id AND an.type = 'speaker_identity'
       WHERE ae.from_id = ANY($1) AND ae.type = 'related_to'`,
      [vpIds],
    );

    for (const row of speakerRows.rows) {
      const speakerId = (row as { speaker_id: string }).speaker_id;
      const speakerNode = await pool.query(
        'SELECT properties FROM aurora_nodes WHERE id = $1',
        [speakerId],
      );
      if (speakerNode.rows.length === 0) continue;

      const props = speakerNode.rows[0].properties as Record<string, unknown>;
      const confirmed = Array.isArray(props.confirmedVoicePrints)
        ? (props.confirmedVoicePrints as string[])
        : [];

      const remaining = confirmed.filter((vpId) => !vpIds.includes(vpId));

      const otherEdges = await pool.query(
        `SELECT COUNT(*) as cnt FROM aurora_edges
         WHERE to_id = $1 AND type = 'related_to' AND from_id != ALL($2)`,
        [speakerId, vpIds],
      );
      const otherEdgeCount = parseInt(String((otherEdges.rows[0] as { cnt: string }).cnt), 10);

      if (remaining.length === 0 && otherEdgeCount === 0) {
        speakerIdsToDelete.push(speakerId);
      } else if (remaining.length < confirmed.length) {
        speakerIdsToUpdate.push({ id: speakerId, remainingVps: remaining });
      }
    }
  }

  // 5. Build complete list of IDs to delete
  const allIds = [nodeId, ...chunkIds, ...vpIds, ...speakerIdsToDelete];

  // 6. Single SQL transaction: soft-delete snapshot → cleanup → hard delete
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 6a. Snapshot parent node into aurora_deleted_nodes (30 day retention)
    const parentNode = await client.query(
      'SELECT id, type, title, properties, confidence, scope, source_url, created FROM aurora_nodes WHERE id = $1',
      [nodeId],
    );
    if (parentNode.rows.length > 0) {
      const n = parentNode.rows[0] as Record<string, unknown>;
      const childrenDeleted = [...chunkIds, ...vpIds, ...speakerIdsToDelete];
      await client.query(
        `INSERT INTO aurora_deleted_nodes
         (id, type, title, properties, confidence, scope, source_url, original_created, deleted_by, children_deleted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET deleted_at = NOW(), expires_at = NOW() + INTERVAL '30 days',
           children_deleted = $10`,
        [n.id, n.type, n.title, JSON.stringify(n.properties), n.confidence, n.scope,
         n.source_url ?? null, n.created, 'obsidian-sync', childrenDeleted],
      );
    }

    await client.query(
      'DELETE FROM confidence_audit WHERE node_id = ANY($1)',
      [allIds],
    );

    const crossRefResult = await client.query(
      'DELETE FROM cross_refs WHERE aurora_node_id = ANY($1)',
      [allIds],
    );
    result.crossRefsRemoved = crossRefResult.rowCount ?? 0;

    for (const update of speakerIdsToUpdate) {
      await client.query(
        `UPDATE aurora_nodes SET properties = jsonb_set(properties, '{confirmedVoicePrints}', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(update.remainingVps), update.id],
      );
    }

    await client.query(
      'DELETE FROM aurora_nodes WHERE id = ANY($1)',
      [allIds],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Cascade delete failed, rolled back', { nodeId, error: String(err) });
    throw err;
  } finally {
    client.release();
  }

  // 7. Sync in-memory graph + JSON file (outside transaction)
  try {
    let graph = await loadAuroraGraph();
    for (const id of allIds) {
      if (graph.nodes.some((n) => n.id === id)) {
        graph = removeAuroraNode(graph, id);
      }
    }
    await saveAuroraGraph(graph);
  } catch (err) {
    logger.warn('JSON graph sync failed after DB delete — regenerate with DB reload', {
      nodeId,
      error: String(err),
    });
  }

  result.deleted = true;
  result.chunksRemoved = chunkIds.length;
  result.voicePrintsRemoved = vpIds.length;
  result.speakerIdentitiesRemoved = speakerIdsToDelete.length;

  logger.info('Cascade delete completed', {
    nodeId,
    chunks: chunkIds.length,
    voicePrints: vpIds.length,
    speakers: speakerIdsToDelete.length,
    crossRefs: result.crossRefsRemoved,
  });

  return result;
}
