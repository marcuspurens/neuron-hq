#!/usr/bin/env python3
"""Patch knowledge-graph.ts to add auto-embed functionality."""

with open('src/core/knowledge-graph.ts', 'r') as f:
    content = f.read()

# 1. Add import after the db.js import
old_import = "import { getPool, isDbAvailable } from './db.js';"
new_import = old_import + "\nimport { isEmbeddingAvailable, getEmbeddingProvider } from './embeddings.js';"
content = content.replace(old_import, new_import)

# 2. Add autoEmbedNodes function AFTER saveGraphToDb and BEFORE loadGraph
# Find the marker: "// --- Load / Save ---"
auto_embed_fn = '''
/**
 * Generate embeddings for nodes that were just saved to DB but don't have embeddings yet.
 * Called as part of saveGraph. Non-fatal: logs warning on failure.
 */
export async function autoEmbedNodes(nodeIds: string[]): Promise<void> {
  if (nodeIds.length === 0) return;
  try {
    if (!(await isEmbeddingAvailable())) return;
    
    const pool = getPool();
    const provider = getEmbeddingProvider();
    
    // Get nodes that need embedding
    const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT id, type, title, properties FROM kg_nodes WHERE id IN (${placeholders}) AND embedding IS NULL`,
      nodeIds,
    );
    
    for (const node of rows) {
      try {
        const text = `${node.type}: ${node.title}. ${JSON.stringify(node.properties)}`;
        const embedding = await provider.embed(text);
        await pool.query(
          'UPDATE kg_nodes SET embedding = $1 WHERE id = $2',
          [`[${embedding.join(',')}]`, node.id],
        );
      } catch (err) {
        console.warn(`Warning: Failed to embed node ${node.id}:`, err);
      }
    }
  } catch (err) {
    console.warn('Warning: Auto-embed failed:', err);
  }
}

'''

marker = '// --- Load / Save ---'
content = content.replace(marker, auto_embed_fn + marker)

# 3. Modify saveGraph to call autoEmbedNodes
old_save_block = """  try {
    if (await isDbAvailable()) {
      await saveGraphToDb(validated);
    }
  } catch {
    // DB write failure is non-fatal — file is the backup
  }"""

new_save_block = """  try {
    if (await isDbAvailable()) {
      await saveGraphToDb(validated);
      // Auto-embed new/updated nodes
      const nodeIds = validated.nodes.map(n => n.id);
      await autoEmbedNodes(nodeIds);
    }
  } catch {
    // DB write failure is non-fatal — file is the backup
  }"""

content = content.replace(old_save_block, new_save_block)

with open('src/core/knowledge-graph.ts', 'w') as f:
    f.write(content)

print("Patched knowledge-graph.ts successfully")
