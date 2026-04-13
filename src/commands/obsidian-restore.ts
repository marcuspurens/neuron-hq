import chalk from 'chalk';
import { getPool } from '../core/db.js';

interface DeletedNode {
  id: string;
  type: string;
  title: string;
  properties: Record<string, unknown>;
  confidence: number;
  scope: string;
  source_url: string | null;
  original_created: Date;
  deleted_at: Date;
  expires_at: Date;
}

export async function purgeExpiredDeleted(): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ count: string }>(
    'DELETE FROM aurora_deleted_nodes WHERE expires_at < NOW() RETURNING id'
  );
  return result.rowCount ?? 0;
}

export async function obsidianRestoreCommand(options: { id?: string }): Promise<void> {
  const pool = getPool();

  if (options.id) {
    const res = await pool.query<DeletedNode>(
      'SELECT * FROM aurora_deleted_nodes WHERE id = $1',
      [options.id]
    );

    if (res.rows.length === 0) {
      console.log(chalk.red(`❌ Ingen raderad nod med ID: ${options.id}`));
      return;
    }

    const node = res.rows[0]!;

    await pool.query(
      `INSERT INTO aurora_nodes (id, type, title, properties, confidence, scope, source_url, created, updated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        node.id,
        node.type,
        node.title,
        node.properties,
        node.confidence,
        node.scope,
        node.source_url,
        node.original_created,
      ]
    );

    await pool.query('DELETE FROM aurora_deleted_nodes WHERE id = $1', [node.id]);

    console.log(chalk.green(`✅ Återställd: ${node.title}`));
    return;
  }

  const res = await pool.query<DeletedNode>(
    `SELECT id, type, title, deleted_at, expires_at
     FROM aurora_deleted_nodes
     WHERE expires_at > NOW()
     ORDER BY deleted_at DESC`
  );

  if (res.rows.length === 0) {
    console.log('Inga raderade noder att återställa.');
    return;
  }

  const idWidth = 36;
  const titleWidth = 40;
  const typeWidth = 16;
  const dateWidth = 20;

  const header =
    chalk.bold('ID'.padEnd(idWidth)) +
    '  ' +
    chalk.bold('Titel'.padEnd(titleWidth)) +
    '  ' +
    chalk.bold('Typ'.padEnd(typeWidth)) +
    '  ' +
    chalk.bold('Raderad'.padEnd(dateWidth)) +
    '  ' +
    chalk.bold('Förfaller');

  console.log('\n' + header);
  console.log('─'.repeat(idWidth + titleWidth + typeWidth + dateWidth * 2 + 10));

  for (const row of res.rows) {
    const deleted = new Date(row.deleted_at).toISOString().slice(0, 19).replace('T', ' ');
    const expires = new Date(row.expires_at).toISOString().slice(0, 19).replace('T', ' ');
    console.log(
      row.id.padEnd(idWidth) +
        '  ' +
        row.title.slice(0, titleWidth).padEnd(titleWidth) +
        '  ' +
        row.type.slice(0, typeWidth).padEnd(typeWidth) +
        '  ' +
        deleted.padEnd(dateWidth) +
        '  ' +
        expires
    );
  }
  console.log('');
}
