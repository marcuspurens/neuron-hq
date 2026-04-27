import 'dotenv/config';
import { getPool } from '../src/core/db.js';

async function main() {
  const pool = getPool();
  const all = await pool.query(
    "SELECT id, title, type FROM aurora_nodes ORDER BY created DESC LIMIT 20",
  );
  console.log('Latest 20 nodes:');
  for (const r of all.rows) {
    console.log(`  ${r.id} | ${r.type} | ${String(r.title).slice(0, 60)}`);
  }

  const pi = await pool.query(
    "SELECT id, title, type FROM aurora_nodes WHERE id LIKE $1",
    ['yt-Dli5slNaJu0%'],
  );
  console.log(`\nPi video nodes: ${pi.rows.length}`);
  for (const r of pi.rows) {
    console.log(`  ${r.id} | ${r.type} | ${r.title}`);
  }
  await pool.end();
}

main();
