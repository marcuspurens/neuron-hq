import { getPool, isDbAvailable } from '../core/db.js';
import { getEmbeddingProvider, isEmbeddingAvailable } from '../core/embeddings.js';

/**
 * Generate embeddings for all kg_nodes that don't have one yet.
 * Batch-processes 10 nodes at a time. Idempotent: skips nodes with embeddings.
 */
export async function embedNodesCommand(): Promise<void> {
  console.log('Checking prerequisites...');

  if (!(await isDbAvailable())) {
    console.error('Database not available. Run `npx tsx src/cli.ts db-migrate` first.');
    return;
  }

  if (!(await isEmbeddingAvailable())) {
    console.error(
      'Embedding provider not available. Ensure Ollama is running with snowflake-arctic-embed model.'
    );
    return;
  }

  const pool = getPool();
  const provider = getEmbeddingProvider();

  // Get nodes without embeddings
  const { rows } = await pool.query(
    'SELECT id, type, title, properties FROM kg_nodes WHERE embedding IS NULL'
  );

  if (rows.length === 0) {
    console.log('All nodes already have embeddings. Nothing to do.');
    return;
  }

  const total = rows.length;
  console.log(`Found ${total} nodes without embeddings.`);

  const BATCH_SIZE = 10;
  let embedded = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const MAX_EMBED_CHARS = 2000;
    const texts = batch.map(
      (node: { type: string; title: string; properties: Record<string, unknown> }) => {
        const textContent = typeof node.properties?.text === 'string' ? node.properties.text : '';
        const full = `${node.type}: ${node.title}. ${textContent}`;
        return full.length > MAX_EMBED_CHARS ? full.slice(0, MAX_EMBED_CHARS) : full;
      }
    );

    try {
      const embeddings = await provider.embedBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        await pool.query('UPDATE kg_nodes SET embedding = $1 WHERE id = $2', [
          `[${embeddings[j].join(',')}]`,
          batch[j].id,
        ]);
      }

      embedded += batch.length;
      console.log(`Embedded ${embedded}/${total} nodes...`);
    } catch (error) {
      console.error(`Error embedding batch starting at index ${i}:`, error);
      throw error;
    }
  }

  console.log(`Done! Embedded ${embedded} nodes.`);
}
