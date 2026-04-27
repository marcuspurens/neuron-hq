import 'dotenv/config';
import { loadAuroraGraph, saveAuroraGraph } from '../src/aurora/aurora-graph.js';
import { getPool } from '../src/core/db.js';

async function main() {
  const graph = await loadAuroraGraph();
  console.log(`Graph has ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
  
  await saveAuroraGraph(graph);
  console.log('Synced to PostgreSQL');

  const pool = getPool();
  const count = await pool.query('SELECT COUNT(*)::int as count FROM aurora_nodes');
  console.log(`DB now has ${count.rows[0].count} nodes`);

  const pi = await pool.query("SELECT id, title FROM aurora_nodes WHERE id = 'yt-Dli5slNaJu0'");
  console.log(`Pi video: ${pi.rows.length > 0 ? pi.rows[0].title : 'NOT FOUND'}`);
  
  await pool.end();
}

main();
