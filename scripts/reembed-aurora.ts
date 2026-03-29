import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

import { getPool } from '../src/core/db.js';
import { getEmbeddingProvider, isEmbeddingAvailable } from '../src/core/embeddings.js';

async function main() {
  const pool = getPool();
  console.log('Embedding available:', await isEmbeddingAvailable());

  const { rows } = await pool.query(
    'SELECT id, type, title, properties FROM aurora_nodes WHERE embedding IS NULL'
  );
  console.log(`Nodes without embeddings: ${rows.length}`);
  if (rows.length === 0) {
    await pool.end();
    return;
  }

  const provider = getEmbeddingProvider();
  const MAX_EMBED_CHARS = 2000;
  let embedded = 0;

  for (const node of rows) {
    const props = node.properties as Record<string, unknown> | undefined;
    const textContent = typeof props?.text === 'string' ? props.text : '';
    const full = `${node.type}: ${node.title}. ${textContent}`;
    const truncated = full.length > MAX_EMBED_CHARS ? full.slice(0, MAX_EMBED_CHARS) : full;

    try {
      const embedding = await provider.embed(truncated);
      await pool.query('UPDATE aurora_nodes SET embedding = $1::vector WHERE id = $2', [
        `[${embedding.join(',')}]`,
        node.id,
      ]);
      embedded++;
      if (embedded % 5 === 0) console.log(`Embedded ${embedded}/${rows.length}...`);
    } catch (err) {
      console.error(`Failed: ${node.id} (len=${truncated.length}):`, String(err));
    }
  }

  console.log(`Done! Embedded ${embedded}/${rows.length}`);
  await pool.end();
}

main().catch(console.error);
