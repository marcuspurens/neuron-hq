import chalk from 'chalk';
import { getPool } from '../core/db.js';

/**
 * CLI command: aurora:show <nodeId>
 * Show full metadata, properties and edges for an Aurora node.
 */
export async function auroraShowCommand(nodeId: string): Promise<void> {
  const pool = getPool();

  const nodeRes = await pool.query(
    'SELECT id, title, type, scope, confidence, created, properties FROM aurora_nodes WHERE id = $1',
    [nodeId],
  );

  if (nodeRes.rows.length === 0) {
    console.log(chalk.red(`\n  Node "${nodeId}" not found.\n`));
    return;
  }

  const node = nodeRes.rows[0];
  const props = node.properties || {};

  console.log('');
  console.log(chalk.bold(`  ${node.title}`));
  console.log(chalk.dim(`  ID: ${node.id}`));
  console.log('');

  // Metadata table
  console.log(chalk.bold('  Metadata'));
  console.log(`  ├─ Type:       ${node.type}`);
  console.log(`  ├─ Scope:      ${node.scope}`);
  console.log(`  ├─ Confidence: ${node.confidence}`);
  console.log(`  ├─ Created:    ${new Date(node.created).toISOString().slice(0, 19)}`);
  if (props.platform) console.log(`  ├─ Platform:   ${props.platform}`);
  if (props.videoId) console.log(`  ├─ Video ID:   ${props.videoId}`);
  if (props.videoUrl) console.log(`  ├─ URL:        ${props.videoUrl}`);
  if (props.sourceUrl) console.log(`  ├─ URL:        ${props.sourceUrl}`);
  if (props.duration) console.log(`  ├─ Duration:   ${props.duration}s`);
  if (props.language) console.log(`  ├─ Language:   ${props.language}`);
  if (props.publishedDate) console.log(`  ├─ Published:  ${props.publishedDate}`);
  if (props.segmentCount) console.log(`  ├─ Segments:   ${props.segmentCount}`);
  if (props.wordCount) console.log(`  ├─ Words:      ${props.wordCount}`);
  console.log(`  └─ Has embed:  ${node.properties ? 'yes' : 'no'}`);

  // Edges
  const edgesRes = await pool.query(
    `SELECT from_id, to_id, type FROM aurora_edges WHERE from_id = $1 OR to_id = $1 ORDER BY type`,
    [nodeId],
  );

  if (edgesRes.rows.length > 0) {
    console.log('');
    console.log(chalk.bold(`  Edges (${edgesRes.rows.length})`));
    for (const edge of edgesRes.rows) {
      if (edge.from_id === nodeId) {
        console.log(`  → ${edge.type} → ${edge.to_id}`);
      } else {
        console.log(`  ← ${edge.type} ← ${edge.from_id}`);
      }
    }
  }

  // Chunks
  const chunksRes = await pool.query(
    `SELECT id FROM aurora_nodes WHERE id LIKE $1 ORDER BY id`,
    [`${nodeId}_chunk_%`],
  );
  if (chunksRes.rows.length > 0) {
    console.log('');
    console.log(chalk.bold(`  Chunks (${chunksRes.rows.length})`));
    for (const chunk of chunksRes.rows) {
      console.log(`  ├─ ${chunk.id}`);
    }
  }

  // Transcript (text)
  const text = props.text as string | undefined;
  if (text) {
    console.log('');
    console.log(chalk.bold('  Transcript / Text'));
    console.log(chalk.dim('  ─'.repeat(40)));
    // Word-wrap at ~100 chars with 2-space indent
    const words = text.split(' ');
    let line = '  ';
    for (const word of words) {
      if (line.length + word.length > 100) {
        console.log(line);
        line = '  ' + word;
      } else {
        line += (line.length > 2 ? ' ' : '') + word;
      }
    }
    if (line.trim()) console.log(line);
  }

  console.log('');
}
