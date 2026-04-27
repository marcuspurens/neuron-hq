import { ingestVideo } from '../src/aurora/video.js';
import { closeMediaClient } from '../src/aurora/media-client.js';
import { loadAuroraGraph, saveAuroraGraph } from '../src/aurora/aurora-graph.js';
import { getPool } from '../src/core/db.js';
import 'dotenv/config';

async function main() {
  console.log('Starting Pi video ingest...');
  try {
    const result = await ingestVideo('https://youtu.be/Dli5slNaJu0');
    console.log('=== Ingest Result ===');
    console.log('Title:', result.title);
    console.log('Transcript node:', result.transcriptNodeId);
    console.log('Chunks:', result.chunksCreated);
    console.log('Cross-refs:', result.crossRefsCreated);

    console.log('Syncing graph to DB...');
    const graph = await loadAuroraGraph();
    await saveAuroraGraph(graph);
    console.log(`Graph synced: ${graph.nodes.length} nodes`);

    const pool = getPool();
    const check = await pool.query("SELECT id FROM aurora_nodes WHERE id = 'yt-Dli5slNaJu0'");
    console.log(`Pi video in DB: ${check.rows.length > 0 ? 'YES' : 'NO'}`);
    await pool.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Ingest failed:', message);
    if (err instanceof Error) console.error(err.stack);
  } finally {
    await closeMediaClient();
  }
}

main();
