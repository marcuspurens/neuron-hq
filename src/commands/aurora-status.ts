import chalk from 'chalk';
import { getPool, closePool, isDbAvailable } from '../core/db.js';

/**
 * CLI command: aurora:status
 * Shows Aurora knowledge graph statistics.
 */
export async function auroraStatusCommand(): Promise<void> {
  console.log(chalk.bold('\nAurora Knowledge Graph Status\n'));

  if (!(await isDbAvailable())) {
    console.log(chalk.yellow('  Database not available. Showing empty status.\n'));
    console.log('  Aurora Knowledge Graph: 0 nodes, 0 edges\n');
    await closePool();
    return;
  }

  const pool = getPool();

  try {
    // Node counts by type
    const { rows: nodeCounts } = await pool.query(
      `SELECT type, COUNT(*) as count FROM aurora_nodes GROUP BY type ORDER BY type`,
    );
    const totalNodes = nodeCounts.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.count), 0);

    // Edge counts by type
    const { rows: edgeCounts } = await pool.query(
      `SELECT type, COUNT(*) as count FROM aurora_edges GROUP BY type ORDER BY type`,
    );
    const totalEdges = edgeCounts.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.count), 0);

    // Embedding coverage
    const { rows: embedRows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding, COUNT(*) as total FROM aurora_nodes`,
    );
    const withEmbedding = Number(embedRows[0]?.with_embedding ?? 0);
    const embedTotal = Number(embedRows[0]?.total ?? 0);

    // Latest node
    const { rows: latestRows } = await pool.query(
      `SELECT title, created FROM aurora_nodes ORDER BY created DESC LIMIT 1`,
    );

    // Confidence distribution
    const { rows: confRows } = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE confidence < 0.1) as stale,
        COUNT(*) FILTER (WHERE confidence >= 0.5) as active
       FROM aurora_nodes`,
    );

    console.log(`  Aurora Knowledge Graph: ${totalNodes} nodes, ${totalEdges} edges\n`);

    if (nodeCounts.length > 0) {
      console.log(chalk.bold('  Nodes by type:'));
      for (const row of nodeCounts) {
        console.log(`    ${row.type}: ${row.count}`);
      }
      console.log('');
    }

    if (edgeCounts.length > 0) {
      console.log(chalk.bold('  Edges by type:'));
      for (const row of edgeCounts) {
        console.log(`    ${row.type}: ${row.count}`);
      }
      console.log('');
    }

    console.log(chalk.bold('  Embedding coverage:'));
    console.log(`    ${withEmbedding}/${embedTotal} nodes have embeddings\n`);

    if (latestRows.length > 0) {
      console.log(chalk.bold('  Latest node:'));
      console.log(`    ${latestRows[0].title} (${latestRows[0].created})\n`);
    }

    console.log(chalk.bold('  Confidence distribution:'));
    console.log(`    Stale (< 0.1): ${confRows[0]?.stale ?? 0}`);
    console.log(`    Active (>= 0.5): ${confRows[0]?.active ?? 0}\n`);
  } catch (err) {
    console.error(chalk.red(`\n  ❌ Error: ${err instanceof Error ? err.message : err}\n`));
  } finally {
    await closePool();
  }
}
